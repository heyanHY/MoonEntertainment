import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 生产环境托管前端静态文件
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  // 对于任何未匹配的请求，都返回 index.html (SPA)
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// 房间存储
const rooms = {};

// 玩家存储
const players = {};

// 牌组生成函数 - 4副牌
function generateDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck = [];
  
  // 生成8副牌
  for (let i = 0; i < 8; i++) {
    for (const suit of suits) {
      for (const value of values) {
        deck.push({ suit, value });
      }
    }
  }
  
  // 洗牌
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
}

// 读取排行榜
function readLeaderboard() {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'leaderboard.json'), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('读取排行榜失败:', error);
    return [];
  }
}

// 保存排行榜
function saveLeaderboard(leaderboard) {
  try {
    fs.writeFileSync(path.join(__dirname, 'leaderboard.json'), JSON.stringify(leaderboard, null, 2));
  } catch (error) {
    console.error('保存排行榜失败:', error);
  }
}

// 更新排行榜
function updateLeaderboard(name, score) {
  const leaderboard = readLeaderboard();
  
  // 检查是否已存在该玩家的记录
  const existingIndex = leaderboard.findIndex(entry => entry.name === name);
  
  if (existingIndex !== -1) {
    // 如果存在，只更新分数如果新分数更高
    if (score > leaderboard[existingIndex].score) {
      leaderboard[existingIndex].score = score;
    }
  } else {
    // 如果不存在，添加新记录
    leaderboard.push({ name, score });
  }
  
  // 按分数降序排序
  leaderboard.sort((a, b) => b.score - a.score);
  
  // 只保留前10名
  const topLeaderboard = leaderboard.slice(0, 10);
  
  saveLeaderboard(topLeaderboard);
  return topLeaderboard;
}

// 计算手牌点数
function calculateHandValue(hand) {
  let value = 0;
  let aceCount = 0;
  
  for (const card of hand) {
    if (card.value === 'A') {
      aceCount++;
      value += 11;
    } else if (['J', 'Q', 'K'].includes(card.value)) {
      value += 10;
    } else {
      value += parseInt(card.value);
    }
  }
  
  // 调整A的点数
  while (value > 21 && aceCount > 0) {
    value -= 10;
    aceCount--;
  }
  
  return value;
}

// 获取公开房间列表
function getPublicRooms() {
  console.log('所有房间:', Object.values(rooms).map(room => ({id: room.id, gameState: room.gameState, playersLength: room.players.length})));
  const filteredRooms = Object.values(rooms).filter(room => {
    console.log('检查房间:', room.id, '游戏状态:', room.gameState, '玩家数量:', room.players.length);
    // 检查游戏状态是否为等待中
    if (room.gameState !== 'waiting') {
      console.log('房间', room.id, '游戏状态不是等待中，过滤掉');
      return false;
    }
    // 检查是否只有系统庄家
    const onlySystemDealer = room.players.length === 1 && room.players[0].id.includes('system_dealer');
    if (onlySystemDealer) {
      console.log('房间', room.id, '只有系统庄家，过滤掉');
      return false;
    }
    console.log('房间', room.id, '符合条件，保留');
    return true;
  });
  console.log('过滤后的房间:', filteredRooms.map(room => ({id: room.id, gameState: room.gameState, playersLength: room.players.length})));
  return filteredRooms.map(room => ({
    id: room.id,
    players: room.players
  }));
}

// 处理新连接
io.on('connection', (socket) => {
  console.log('新玩家连接:', socket.id);
  
  // 获取公开房间列表
  socket.on('getPublicRooms', () => {
    socket.emit('publicRooms', { rooms: getPublicRooms() });
  });
  
  // 获取排行榜
  socket.on('getLeaderboard', () => {
    const leaderboard = readLeaderboard();
    socket.emit('leaderboardData', { leaderboard });
  });
  
  // 创建房间
  socket.on('createRoom', () => {
    const roomId = uuidv4().substring(0, 6);
    const deck = generateDeck();
    
    rooms[roomId] = {
      id: roomId,
      players: [],
      deck,
      currentPlayerIndex: 0,
      gameState: 'waiting',
      dealer: null,
      owner: null
    };
    
    console.log('创建房间:', roomId);
    
    // 通知客户端房间创建成功
    socket.emit('roomCreated', { roomId });
    
    // 通知所有玩家更新公开房间列表
    const publicRooms = getPublicRooms();
    console.log('公开房间列表:', publicRooms);
    io.emit('publicRooms', { rooms: publicRooms });
  });
  
  // 加入房间
  socket.on('joinRoom', (roomId) => {
    if (rooms[roomId]) {
      const room = rooms[roomId];
      
      // 检查房间是否已满
      if (room.players.length >= 6) {
        socket.emit('error', '房间已满');
        return;
      }
      
      // 检查玩家是否已经在房间中
      const playerId = socket.id;
      if (room.players.some(p => p.id === playerId)) {
        socket.emit('error', '您已经在房间中');
        return;
      }
      
      // 创建新玩家
      const player = {
        id: playerId,
        name: players[playerId]?.name || players[playerId]?.player?.name || `玩家${room.players.length + 1}`,
        score: players[playerId]?.score || players[playerId]?.player?.score || 10000, // 初始积分
        hand: [],
        value: 0,
        status: 'waiting',
        bet: 0, // 初始下注
        ready: false
      };
      
      room.players.push(player);
      players[playerId] = { roomId, player };
      
      // 如果房间还没有房主，设置当前玩家为房主
      if (!room.owner) {
        room.owner = playerId;
        console.log('设置房主:', playerId, player.name);
      }
      
      socket.join(roomId);
      socket.emit('joinedRoom', { 
        roomId, 
        player, 
        players: room.players,
        owner: room.owner,
        dealer: room.dealer
      });
      
      // 发送游戏重置事件，设置游戏状态为 waiting，显示下注界面
      socket.emit('gameReset', {
        players: room.players,
        gameState: 'waiting',
        dealer: room.dealer
      });
      io.to(roomId).emit('playerJoined', { player });
      
      // 通知所有玩家更新公开房间列表
      io.emit('publicRooms', { rooms: getPublicRooms() });
      
      console.log('玩家加入房间:', playerId, roomId);
    } else {
      socket.emit('error', '房间不存在');
    }
  });
  
  // 设置玩家昵称
  socket.on('setNickname', (nickname) => {
    const playerId = socket.id;
    if (players[playerId]) {
      players[playerId].player.name = nickname;
      const roomId = players[playerId].roomId;
      if (roomId && rooms[roomId]) {
        const player = rooms[roomId].players.find(p => p.id === playerId);
        if (player) {
          player.name = nickname;
          io.to(roomId).emit('playerUpdated', { player });
        }
      }
    } else {
      // 存储玩家信息
      players[playerId] = {
        name: nickname,
        score: 10000
      };
    }
  });
  
  // 开始游戏
  function startGameLogic(roomId) {
    const room = rooms[roomId];
    console.log('开始游戏逻辑，当前游戏状态:', room.gameState);
    room.gameState = 'playing';
    
    // 发牌
    for (const player of room.players) {
      if (player.id !== room.dealer && player.score > 0) {
        console.log('给玩家发牌:', player.name, '下注金额:', player.bet);
        player.hand = [room.deck.pop(), room.deck.pop()];
        player.value = calculateHandValue(player.hand);
        player.status = 'playing';
        // 保留玩家的下注选择，不强制设置为100
      } else if (player.id !== room.dealer && player.score <= 0) {
        console.log('玩家积分不足，设为观众:', player.name);
        player.hand = [];
        player.value = 0;
        player.status = 'spectator';
        player.bet = 0;
      }
    }
    
    // 发庄家牌
    room.dealerHand = [room.deck.pop(), room.deck.pop()];
    room.dealerValue = calculateHandValue(room.dealerHand);
    
    // 跳过庄家和积分不足的玩家，设置初始玩家索引
    room.currentPlayerIndex = 0;
    while (room.currentPlayerIndex < room.players.length && (room.players[room.currentPlayerIndex].id === room.dealer || room.players[room.currentPlayerIndex].score <= 0)) {
      room.currentPlayerIndex++;
    }
    
    io.to(roomId).emit('gameStarted', {
          players: room.players,
          dealerHand: [room.dealerHand[0], { suit: '?', value: '?' }], // 只显示一张庄家牌
          currentPlayerIndex: room.currentPlayerIndex,
          gameState: room.gameState,
          dealer: room.dealer
        });
  }
  
  // 玩家下注
  socket.on('placeBet', (amount) => {
    const playerId = socket.id;
    const playerInfo = players[playerId];
    
    if (playerInfo) {
      const roomId = playerInfo.roomId;
      const room = rooms[roomId];
      const player = room.players.find(p => p.id === playerId);
      
      console.log('收到下注请求:', player?.name, '金额:', amount, '游戏状态:', room?.gameState, '玩家积分:', player?.score);
      
      if (player && room.gameState === 'waiting') {
        if (player.score >= amount) {
          console.log('下注成功:', player.name, '金额:', amount);
          player.bet = amount;
          player.ready = true; // 确认下注后设置为已准备
          io.to(roomId).emit('playerUpdated', { player });
          
          // 检查是否有庄家，如果没有庄家，自动创建系统庄家
          if (!room.dealer) {
            console.log('创建系统庄家');
            // 创建系统庄家
            const systemDealerId = 'system_dealer_' + roomId;
            const systemDealer = {
              id: systemDealerId,
              name: '系统庄家',
              score: 100000, // 系统庄家积分
              hand: [],
              value: 0,
              status: 'waiting',
              bet: 0,
              ready: true
            };
            
            room.players.push(systemDealer);
            room.dealer = systemDealerId;
            
            // 通知客户端系统庄家已添加
            io.to(roomId).emit('playerJoined', { player: systemDealer });
            io.to(roomId).emit('dealerUpdated', { dealer: systemDealerId });
            console.log('系统庄家创建成功');
          }
          
          // 确保所有玩家都已准备（包括系统庄家和已下注的玩家）
          room.players.forEach(player => {
            if (player.id === room.dealer) {
              player.ready = true;
            } else if (player.bet > 0) {
              // 已下注的玩家自动视为已准备
              player.ready = true;
              console.log('玩家', player.name, '已下注，自动设置为已准备');
            }
          });
          
          // 检查所有非庄家玩家是否都已准备就绪
          const nonDealerPlayers = room.players.filter(p => p.id !== room.dealer && p.score >= 0);
          const allReady = nonDealerPlayers.every(p => p.ready);
          
          // 确保至少有一个非庄家玩家，且所有非庄家玩家都已准备就绪
          if (nonDealerPlayers.length > 0 && allReady) {
            console.log('所有玩家都已准备就绪，自动开始游戏');
            // 开始游戏
            startGameLogic(roomId);
          } else {
            console.log('还有玩家未准备就绪，等待所有玩家下注');
            // 通知所有玩家当前的准备状态
            io.to(roomId).emit('playersUpdated', { players: room.players });
          }
        } else {
          console.log('下注失败:', player.name, '积分不足');
          socket.emit('error', '积分不足，无法下注');
        }
      } else {
        console.log('下注失败:', player?.name, '游戏状态:', room?.gameState);
      }
    }
  });

  // 玩家准备/取消准备
  socket.on('readyGame', (ready) => {
    const playerId = socket.id;
    const playerInfo = players[playerId];
    
    if (playerInfo) {
      const roomId = playerInfo.roomId;
      const room = rooms[roomId];
      const player = room.players.find(p => p.id === playerId);
      
      if (player && room.gameState === 'waiting') {
        player.ready = ready;
        io.to(roomId).emit('playerUpdated', { player });
      }
    }
  });

  // 申请坐庄
  socket.on('applyDealer', () => {
    const playerId = socket.id;
    const playerInfo = players[playerId];
    
    if (playerInfo) {
      const roomId = playerInfo.roomId;
      const room = rooms[roomId];
      
      if (room && room.gameState === 'waiting' && !room.dealer) {
        room.dealer = playerId;
        io.to(roomId).emit('dealerUpdated', { dealer: playerId });
      }
    }
  });

  // 手动开始游戏
  socket.on('startGame', () => {
    console.log('收到开始游戏请求');
    const playerId = socket.id;
    const playerInfo = players[playerId];
    
    if (playerInfo) {
      const roomId = playerInfo.roomId;
      const room = rooms[roomId];
      console.log('房间信息:', roomId, room.players.length, room.dealer);
      
      // 检查是否是房主
      if (room.owner !== playerId) {
        console.log('不是房主');
        socket.emit('error', '只有房主可以开始游戏');
        return;
      }
      
      // 检查是否有庄家，如果没有庄家，自动创建系统庄家
      if (!room.dealer) {
        console.log('创建系统庄家');
        // 创建系统庄家
        const systemDealerId = 'system_dealer_' + roomId;
        const systemDealer = {
          id: systemDealerId,
          name: '系统庄家',
          score: 100000, // 系统庄家积分
          hand: [],
          value: 0,
          status: 'waiting',
          bet: 0,
          ready: true
        };
        
        room.players.push(systemDealer);
        room.dealer = systemDealerId;
        
        // 通知客户端系统庄家已添加
        io.to(roomId).emit('playerJoined', { player: systemDealer });
        io.to(roomId).emit('dealerUpdated', { dealer: systemDealerId });
        console.log('系统庄家创建成功');
      }
      
      // 确保所有玩家都已准备（包括系统庄家和已下注的玩家）
      room.players.forEach(player => {
        if (player.id === room.dealer) {
          player.ready = true;
        } else if (player.bet > 0) {
          // 已下注的玩家自动视为已准备
          player.ready = true;
          console.log('玩家', player.name, '已下注，自动设置为已准备');
        }
      });
      
      // 再次检查是否所有玩家都已准备
      const allReady = room.players.every(player => {
        if (player.id === room.dealer) {
          return true; // 庄家自动视为已准备
        } else if (player.bet > 0) {
          return true; // 已下注的玩家自动视为已准备
        } else if (player.score <= 0) {
          return true; // 积分不足的玩家不参与游戏
        } else {
          return player.ready;
        }
      });
      console.log('所有玩家准备状态:', allReady, room.players.map(p => ({name: p.name, ready: p.ready, bet: p.bet, score: p.score})));
      if (!allReady) {
        socket.emit('error', '所有玩家必须准备就绪才能开始游戏');
        return;
      }
      
      // 检查所有玩家是否都已下注，且积分足够
      const allPlayersBet = room.players.every(player => {
        if (player.id === room.dealer) {
          return true; // 庄家不需要下注
        }
        if (player.score <= 0) {
          return true; // 积分不足的玩家不参与游戏
        }
        return player.bet > 0;
      });
      console.log('所有玩家下注状态:', allPlayersBet, room.players.map(p => ({name: p.name, bet: p.bet, score: p.score})));
      if (!allPlayersBet) {
        socket.emit('error', '有玩家未下注，请先下注后再开始游戏');
        return;
      }
      
      if (room && room.gameState === 'waiting' && room.players.length > 0) {
        console.log('开始游戏');
        startGameLogic(roomId);
      }
    }
  });

  // 玩家操作
  socket.on('playerAction', (action, handIndex) => {
    const playerId = socket.id;
    const playerInfo = players[playerId];
    
    if (playerInfo) {
      const roomId = playerInfo.roomId;
      const room = rooms[roomId];
      let player;
      
      // 如果指定了手牌索引，找到对应的玩家
      if (handIndex === 0) {
        // 第一手牌，使用原始玩家
        player = room.players.find(p => p.id === playerId);
      } else if (handIndex === 1) {
        // 第二手牌，使用分牌玩家
        player = room.players.find(p => p.id === playerId + '_split');
      } else {
        // 没有指定手牌索引，使用原始玩家
        player = room.players.find(p => p.id === playerId);
      }
      
      if (player && player.status === 'playing' && player.score > 0) {
        if (action === 'hit') {
          // 抽牌
          const card = room.deck.pop();
          player.hand.push(card);
          player.value = calculateHandValue(player.hand);
          
          // 检查是否爆牌
          if (player.value > 21) {
            player.status = 'busted';
            room.currentPlayerIndex++;
            checkGameEnd(roomId);
          }
        } else if (action === 'stand') {
          // 停牌
          player.status = 'stood';
          room.currentPlayerIndex++;
          checkGameEnd(roomId);
        } else if (action === 'double') {
          // 加倍
          if (player.hand.length === 2) {
            player.bet *= 2;
            const card = room.deck.pop();
            player.hand.push(card);
            player.value = calculateHandValue(player.hand);
            
            // 检查是否爆牌
            if (player.value > 21) {
              player.status = 'busted';
            } else {
              player.status = 'stood';
            }
            room.currentPlayerIndex++;
            checkGameEnd(roomId);
          }
        } else if (action === 'split') {
          // 分牌
          console.log('收到分牌请求:', player.name, player.hand);
          if (player.hand.length === 2) {
            // 计算两张牌的点数
            const getCardValue = (card) => {
              if (['J', 'Q', 'K'].includes(card.value)) {
                return 10;
              } else if (card.value === 'A') {
                return 11; // A的点数在分牌时按11计算
              } else {
                return parseInt(card.value);
              }
            };
            const value1 = getCardValue(player.hand[0]);
            const value2 = getCardValue(player.hand[1]);
            console.log('计算点数:', value1, value2);
            
            if (value1 === value2) {
              console.log('点数相同，可以分牌');
              // 创建第二手牌
              const splitHand = [player.hand.pop()];
              const splitPlayer = {
                ...player,
                id: player.id + '_split', // 为分牌后的玩家生成一个新的唯一 ID
                name: player.name + '分牌', // 分牌玩家的名称
                hand: splitHand,
                value: calculateHandValue(splitHand),
                bet: player.bet
              };
              
              // 给两手牌各发一张新牌
              player.hand.push(room.deck.pop());
              splitHand.push(room.deck.pop());
              player.value = calculateHandValue(player.hand);
              splitPlayer.value = calculateHandValue(splitHand);
              
              console.log('分牌后:', player.name, player.hand, splitPlayer.name, splitPlayer.hand);
              
              // 将分牌玩家添加到房间
              room.players.push(splitPlayer);
              
              // 将分牌玩家添加到 players 对象中
              players[splitPlayer.id] = { roomId, player: splitPlayer };
              
              // 通知客户端分牌成功，更新两个玩家的状态
              io.to(roomId).emit('playerUpdated', { player, currentPlayerIndex: room.currentPlayerIndex });
              io.to(roomId).emit('playerJoined', { player: splitPlayer });
              
              // 分牌后，玩家应该继续操作第一手牌，所以不递增当前玩家索引
              console.log('分牌成功，玩家继续操作第一手牌');
              // 不需要调用 checkGameEnd，因为玩家还需要继续操作
            } else {
              console.log('点数不同，不能分牌');
            }
          } else {
            console.log('手牌数量不是2，不能分牌');
          }
        } else if (action === 'surrender') {
          // 投降
          player.status = 'surrendered';
          player.result = 'surrender';
          player.score -= player.bet / 2; // 投降只输一半
          room.currentPlayerIndex++;
          checkGameEnd(roomId);
        } else if (action === 'insurance') {
          // 保险
          if (player.hand.length === 2 && room.dealerHand[0].value === 'A') {
            const insuranceAmount = player.bet / 2;
            player.insurance = insuranceAmount;
            player.score -= insuranceAmount; // 扣除保险金额
            
            // 检查庄家是否是黑杰克
            const dealerIsBlackjack = calculateHandValue(room.dealerHand) === 21;
            if (dealerIsBlackjack) {
              // 庄家是黑杰克，保险生效，玩家赢回一倍保险金
              player.score += insuranceAmount * 2;
            }
            // 如果庄家不是黑杰克，玩家输掉保险金，游戏继续
          }
        }
        
        // 通知客户端玩家状态更新
        io.to(roomId).emit('playerUpdated', { player, currentPlayerIndex: room.currentPlayerIndex });
        
        // 如果是分牌玩家，也通知客户端更新
        if (player.id.includes('_split')) {
          const originalPlayerId = player.id.replace('_split', '');
          const originalPlayer = room.players.find(p => p.id === originalPlayerId);
          if (originalPlayer) {
            io.to(roomId).emit('playerUpdated', { player: originalPlayer, currentPlayerIndex: room.currentPlayerIndex });
          }
        }
      }
    }
  });
  
  // 检查游戏是否结束
  function checkGameEnd(roomId) {
    const room = rooms[roomId];
    
    // 跳过庄家和积分不足的玩家，因为他们不需要操作
    while (room.currentPlayerIndex < room.players.length && (room.players[room.currentPlayerIndex].id === room.dealer || room.players[room.currentPlayerIndex].score <= 0)) {
      room.currentPlayerIndex++;
    }
    
    // 检查是否所有玩家都已行动
    if (room.currentPlayerIndex >= room.players.length) {
      // 庄家行动
      while (room.dealerValue < 17) {
        const card = room.deck.pop();
        room.dealerHand.push(card);
        room.dealerValue = calculateHandValue(room.dealerHand);
      }
      
      // 判定胜负并更新积分
      let dealerWins = 0;
      let dealerLosses = 0;
      let dealerTies = 0;
      let totalWinningBets = 0;
      let totalLosingBets = 0;
      
      // 存储原始玩家和分牌玩家的积分变化
      const splitPlayerScores = {};
      
      for (const player of room.players) {
        if (player.id === room.dealer || player.score <= 0) {
          // 庄家不参与胜负判定，跳过
          continue;
        }
        
        // 检查是否是黑杰克（前两张牌是A和10点牌）
        const isBlackjack = player.hand.length === 2 && player.value === 21;
        const dealerIsBlackjack = room.dealerHand.length === 2 && room.dealerValue === 21;
        
        if (player.status === 'busted') {
          player.result = 'lose';
          player.score -= player.bet; // 输了扣积分
          dealerWins++;
          totalLosingBets += player.bet;
        } else if (player.status === 'surrendered') {
          // 投降已经处理过了，跳过
          dealerWins++;
          totalLosingBets += player.bet / 2; // 投降只输一半
        } else if (isBlackjack && !dealerIsBlackjack) {
          // 玩家黑杰克，庄家不是黑杰克
          player.result = 'win';
          player.score += player.bet * 1.5; // 黑杰克赢得1.5倍赌注
          dealerLosses++;
          totalWinningBets += player.bet * 1.5;
        } else if (dealerIsBlackjack && !isBlackjack) {
          // 庄家黑杰克，玩家不是黑杰克
          player.result = 'lose';
          player.score -= player.bet; // 输了扣积分
          dealerWins++;
          totalLosingBets += player.bet;
        } else if (room.dealerValue > 21) {
          player.result = 'win';
          player.score += player.bet; // 赢了加积分
          dealerLosses++;
          totalWinningBets += player.bet;
        } else if (player.value > room.dealerValue) {
          player.result = 'win';
          player.score += player.bet; // 赢了加积分
          dealerLosses++;
          totalWinningBets += player.bet;
        } else if (player.value < room.dealerValue) {
          player.result = 'lose';
          player.score -= player.bet; // 输了扣积分
          dealerWins++;
          totalLosingBets += player.bet;
        } else {
          player.result = 'tie';
          // 平局不扣分
          dealerTies++;
        }
        
        // 记录分牌玩家的积分变化
        if (player.id.includes('_split')) {
          const originalPlayerId = player.id.replace('_split', '');
          if (!splitPlayerScores[originalPlayerId]) {
            splitPlayerScores[originalPlayerId] = 0;
          }
          splitPlayerScores[originalPlayerId] += player.score - (players[originalPlayerId]?.player?.score || 10000);
        }
        
        // 更新玩家信息
        if (players[player.id]) {
          players[player.id].player.score = player.score;
          // 跳过分牌玩家，不更新排行榜
          if (!player.id.includes('_split')) {
            // 更新排行榜
            updateLeaderboard(player.name, player.score);
          }
        }
      }
      
      // 计算庄家的胜负结果
      const dealer = room.players.find(p => p.id === room.dealer);
      if (dealer) {
        // 计算庄家的积分变化：赢的下注总和 - 输的下注总和
        const scoreChange = totalLosingBets - totalWinningBets;
        
        if (scoreChange > 0) {
          dealer.result = 'win';
          dealer.score += scoreChange;
        } else if (scoreChange < 0) {
          dealer.result = 'lose';
          dealer.score += scoreChange; // 因为 scoreChange 是负数，所以用 += 相当于 -= Math.abs(scoreChange)
        } else {
          dealer.result = 'tie';
          // 平局不扣分
        }
        
        // 更新庄家信息
        if (players[dealer.id]) {
          players[dealer.id].player.score = dealer.score;
        }
      }
      
      // 合并分牌玩家的积分到原始玩家
      for (const originalPlayerId in splitPlayerScores) {
        const originalPlayer = room.players.find(p => p.id === originalPlayerId);
        if (originalPlayer) {
          originalPlayer.score += splitPlayerScores[originalPlayerId];
          // 更新原始玩家信息
          if (players[originalPlayerId]) {
            players[originalPlayerId].player.score = originalPlayer.score;
          }
        }
      }
      
      // 移除分牌玩家
      const originalPlayers = room.players.filter(p => !p.id.includes('_split'));
      room.players = originalPlayers;
      
      room.gameState = 'ended';
      
      io.to(roomId).emit('gameEnded', {
      players: room.players,
      dealerHand: room.dealerHand,
      dealerValue: room.dealerValue,
      gameState: room.gameState,
      dealer: room.dealer
    });
    }
  }
  
  // 重新开始游戏
  socket.on('restartGame', () => {
    const playerId = socket.id;
    const playerInfo = players[playerId];
    
    if (playerInfo) {
      const roomId = playerInfo.roomId;
      const room = rooms[roomId];
      
      if (room && room.gameState === 'ended') {
        console.log('重新开始游戏，当前游戏状态:', room.gameState);
        // 重置游戏
        room.deck = generateDeck();
        room.currentPlayerIndex = 0;
        room.gameState = 'waiting';
        console.log('重置游戏状态为:', room.gameState);
        
        // 重置玩家，移除分牌产生的额外玩家
        const originalPlayers = room.players.filter(p => p.id !== room.dealer);
        let dealer = room.players.find(p => p.id === room.dealer);
        
        // 检查庄家积分是否为负数，如果是，重置庄家
        if (dealer && dealer.score < 0) {
          console.log('庄家积分不足，重置庄家');
          room.dealer = null;
          dealer = null;
          // 通知所有玩家庄家已爆仓
          io.to(roomId).emit('error', '庄家已爆仓，需要重新申请坐庄');
        }
        
        room.players = [dealer, ...originalPlayers].filter(Boolean);
        
        // 重置玩家状态
        for (const player of room.players) {
          if (player.id !== room.dealer) {
            player.hand = [];
            player.value = 0;
            player.status = 'waiting';
            player.result = null;
            player.bet = 0; // 重置下注金额，强制玩家在下一局重新下注
            player.ready = false; // 重置准备状态，强制玩家在下一局重新确认下注
          }
        }
        
        // 重置庄家
        room.dealerHand = [];
        room.dealerValue = 0;
        
        // 通知客户端游戏状态已重置为等待下注
        io.to(roomId).emit('gameReset', {
          players: room.players,
          gameState: room.gameState,
          dealer: room.dealer
        });
      }
    }
  });


  
  // 玩家离开
  socket.on('leaveRoom', () => {
    const playerId = socket.id;
    const playerInfo = players[playerId];
    
    if (playerInfo) {
      const roomId = playerInfo.roomId;
      const room = rooms[roomId];
      
      if (room) {
        // 从房间中移除玩家
        room.players = room.players.filter(p => p.id !== playerId);
        
        // 如果离开的是庄家，重置庄家
        if (room.dealer === playerId) {
          room.dealer = null;
        }
        
        // 如果离开的是房主，重新设置房主
        if (room.owner === playerId && room.players.length > 0) {
          room.owner = room.players[0].id;
        }
        
        // 过滤掉分牌产生的玩家，只保留原始玩家和庄家
        const realPlayers = room.players.filter(p => !p.id.includes('_split'));
        
        // 检查房间中是否只剩下系统庄家
        const onlySystemDealer = realPlayers.length === 1 && realPlayers[0].id.includes('system_dealer');
        
        if (room.players.length === 0 || onlySystemDealer) {
          // 房间为空或只剩下系统庄家，删除房间
          delete rooms[roomId];
        } else {
          // 通知其他玩家
          io.to(roomId).emit('playerLeft', { playerId });
          // 通知其他玩家更新房主和庄家信息
          io.to(roomId).emit('roomUpdated', { 
            owner: room.owner, 
            dealer: room.dealer 
          });
        }
      }
      
      // 通知所有玩家更新公开房间列表
      io.emit('publicRooms', { rooms: getPublicRooms() });
      
      console.log('玩家离开:', playerId);
    }
  });

  // 玩家断开连接
  socket.on('disconnect', () => {
    const playerId = socket.id;
    const playerInfo = players[playerId];
    
    if (playerInfo) {
      const roomId = playerInfo.roomId;
      const room = rooms[roomId];
      
      if (room) {
        // 从房间中移除玩家
        room.players = room.players.filter(p => p.id !== playerId);
        
        // 如果离开的是庄家，重置庄家
        if (room.dealer === playerId) {
          room.dealer = null;
        }
        
        // 如果离开的是房主，重新设置房主
        if (room.owner === playerId && room.players.length > 0) {
          room.owner = room.players[0].id;
        }
        
        // 过滤掉分牌产生的玩家，只保留原始玩家和庄家
        const realPlayers = room.players.filter(p => !p.id.includes('_split'));
        
        // 检查房间中是否只剩下系统庄家
        const onlySystemDealer = realPlayers.length === 1 && realPlayers[0].id.includes('system_dealer');
        
        if (room.players.length === 0 || onlySystemDealer) {
          // 房间为空或只剩下系统庄家，删除房间
          delete rooms[roomId];
        } else {
          // 通知其他玩家
          io.to(roomId).emit('playerLeft', { playerId });
          // 通知其他玩家更新房主和庄家信息
          io.to(roomId).emit('roomUpdated', { 
            owner: room.owner, 
            dealer: room.dealer 
          });
        }
      }
      
      // 通知所有玩家更新公开房间列表
      io.emit('publicRooms', { rooms: getPublicRooms() });
      
      console.log('玩家断开连接:', playerId);
    }
  });
});

const PORT = process.env.PORT || 3005;
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
