import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

function App() {
  const [socket, setSocket] = useState(null);
  const [page, setPage] = useState('home');
  const [nickname, setNickname] = useState(localStorage.getItem('playerName') || '');
  const [roomId, setRoomId] = useState('');
  const [player, setPlayer] = useState(null);
  const [error, setError] = useState('');
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [game, setGame] = useState(null);
  const [betAmount, setBetAmount] = useState(200);
  const [betStatus, setBetStatus] = useState('下注中');
  const [owner, setOwner] = useState(null);
  const [dealer, setDealer] = useState(null);
  const [players, setPlayers] = useState([]);
  const [lastScore, setLastScore] = useState(10000); // 上一局结束时的积分

  useEffect(() => {
    // 开发环境连接 localhost，生产环境生产环境连接 Railway 后端
    const socketUrl = import.meta.env.DEV ? 'http://localhost:3005' : 'https://moonentertainment-production.up.railway.app';
    const newSocket = io(socketUrl);
    setSocket(newSocket);

    // 监听房间创建成功
    newSocket.on('roomCreated', (data) => {
      setRoomId(data.roomId);
      setCurrentRoom(data.roomId);
    });

    // 监听加入房间成功
    newSocket.on('joinedRoom', (data) => {
      setCurrentRoom(data.roomId);
      setOwner(data.owner);
      setDealer(data.dealer);
      setPlayers(data.players);
      // 更新 player 状态，确保当前玩家的信息是最新的
      const currentPlayer = data.players.find(p => p.id === newSocket.id);
      if (currentPlayer) {
        setPlayer(currentPlayer);
      }
      setPage('game');
    });

    // 监听玩家加入
    newSocket.on('playerJoined', (data) => {
      setPlayers(prevPlayers => {
        // 检查玩家是否已经存在，避免重复添加
        if (!prevPlayers.some(p => p.id === data.player.id)) {
          return [...prevPlayers, data.player];
        }
        return prevPlayers;
      });
      
      // 更新 game 状态，添加新玩家
      setGame(prevGame => {
        if (prevGame) {
          return {
            ...prevGame,
            players: [...prevGame.players, data.player]
          };
        }
        return prevGame;
      });
    });

    // 监听玩家离开
    newSocket.on('playerLeft', (data) => {
      setPlayers(prevPlayers => prevPlayers.filter(p => p.id !== data.playerId));
    });

    // 监听房间更新
    newSocket.on('roomUpdated', (data) => {
      setOwner(data.owner);
      setDealer(data.dealer);
    });

    // 监听庄家更新
    newSocket.on('dealerUpdated', (data) => {
      setDealer(data.dealer);
    });

    // 监听获取公开房间列表
    newSocket.on('publicRooms', (data) => {
      setRooms(data.rooms);
    });

    // 监听游戏开始
    newSocket.on('gameStarted', (data) => {
      setGame(data);
      // 更新 players 状态，确保玩家列表保持同步
      if (data.players) {
        setPlayers(data.players);
        // 更新 player 状态，确保当前玩家的信息是最新的
        const currentPlayer = data.players.find(p => p.id === newSocket.id);
        if (currentPlayer) {
          setPlayer(currentPlayer);
        }
      }
      // 如果有庄家，更新 dealer 状态
      if (data.dealer) {
        setDealer(data.dealer);
      }
    });

    // 监听玩家更新
    newSocket.on('playerUpdated', (data) => {
      // 更新 players 状态
      setPlayers(prevPlayers => {
        const existingPlayerIndex = prevPlayers.findIndex(p => p.id === data.player.id);
        if (existingPlayerIndex >= 0) {
          // 更新现有玩家
          const updatedPlayers = [...prevPlayers];
          updatedPlayers[existingPlayerIndex] = data.player;
          return updatedPlayers;
        } else {
          // 添加新玩家（如分牌产生的玩家）
          return [...prevPlayers, data.player];
        }
      });
      
      // 更新 player 状态，如果更新的是当前玩家
      if (data.player.id === newSocket.id) {
        setPlayer(data.player);
        // 更新 betAmount 状态为玩家的下注金额
        setBetAmount(data.player.bet);
        // 更新 betStatus 状态
        if (data.player.ready) {
          setBetStatus('已下注');
        } else {
          setBetStatus('下注中');
        }
      }
      
      // 更新 game 状态
      setGame(prevGame => {
        if (prevGame) {
          return {
            ...prevGame,
            players: prevGame.players.map(player => 
              player.id === data.player.id ? data.player : player
            ),
            currentPlayerIndex: data.currentPlayerIndex
          };
        }
        return prevGame;
      });
    });

    // 监听游戏结束
    newSocket.on('gameEnded', (data) => {
      setGame(data);
      // 更新 players 状态，确保玩家列表保持同步（移除分牌玩家）
      if (data.players) {
        setPlayers(data.players);
        // 更新 player 状态，确保当前玩家的积分是最新的
        const currentPlayer = data.players.find(p => p.id === newSocket.id);
        if (currentPlayer) {
          setPlayer(currentPlayer);
        }
      }
      // 如果有庄家，更新 dealer 状态
      if (data.dealer) {
        setDealer(data.dealer);
      }
    });
    
    // 监听游戏重置
    newSocket.on('gameReset', (data) => {
      setGame(data);
      // 更新 players 状态
      if (data.players) {
        setPlayers(data.players);
        // 更新 player 状态
        const currentPlayer = data.players.find(p => p.id === newSocket.id);
        if (currentPlayer) {
          setPlayer(currentPlayer);
          // 更新 lastScore 为当前积分，用于计算下一局的积分变化
          setLastScore(currentPlayer.score);
          // 更新 betAmount 状态为玩家的下注金额（通常为0，因为游戏重置后下注金额会被重置）
          setBetAmount(currentPlayer.bet);
          // 更新 betStatus 状态为下注中
          setBetStatus('下注中');
        }
        
        // 检查是否有庄家的积分是负数
        const negativeDealer = data.players.find(p => p.id === data.dealer && p.score < 0);
        if (negativeDealer) {
          // 显示庄家爆仓的提示
          setError('庄家已爆仓，需要重新申请坐庄');
        }
      }
      // 如果有庄家，更新 dealer 状态
      if (data.dealer) {
        setDealer(data.dealer);
      }
    });

    // 监听错误
    newSocket.on('error', (message) => {
      setError(message);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (page === 'lobby' && socket) {
      socket.emit('getPublicRooms');
    }
  }, [page, socket]);

  const handleEnterGame = () => {
    if (nickname.trim()) {
      // 保存昵称到本地存储
      localStorage.setItem('playerName', nickname.trim());
      socket.emit('setNickname', nickname.trim());
      const newPlayer = {
        id: socket.id,
        name: nickname.trim(),
        score: 10000,
        hand: [],
        value: 0,
        status: 'waiting',
        bet: 0,
        ready: false
      };
      setPlayer(newPlayer);
      setPage('lobby');
    } else {
      setError('请输入昵称');
    }
  };

  const handleCreateRoom = () => {
    if (socket) {
      socket.emit('createRoom');
    } else {
      console.error('Socket not initialized');
    }
  };

  const handleJoinRoom = () => {
    if (socket) {
      socket.emit('joinRoom', roomId);
    } else {
      console.error('Socket not initialized');
    }
  };

  const handleJoinExistingRoom = (existingRoomId) => {
    if (socket) {
      setRoomId(existingRoomId);
      socket.emit('joinRoom', existingRoomId);
    } else {
      console.error('Socket not initialized');
    }
  };

  const handlePlayerAction = (action, handIndex) => {
    console.log('handlePlayerAction called:', action, handIndex);
    if (socket) {
      socket.emit('playerAction', action, handIndex);
    } else {
      console.error('Socket not initialized');
    }
  };

  const handleBet = (amount) => {
    setBetAmount(amount);
    // 只更新本地下注金额，不发送到服务器
  };

  const handleRestartGame = () => {
    if (socket) {
      socket.emit('restartGame');
    } else {
      console.error('Socket not initialized');
    }
  };

  const handleReadyGame = () => {
    if (socket) {
      socket.emit('readyGame', !player?.ready);
    } else {
      console.error('Socket not initialized');
    }
  };

  const handleApplyDealer = () => {
    if (socket) {
      socket.emit('applyDealer');
    } else {
      console.error('Socket not initialized');
    }
  };

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(currentRoom);
    alert('房间号已复制到剪贴板');
  };

  const handleLeaveRoom = () => {
    if (socket) {
      socket.emit('leaveRoom');
    } else {
      console.error('Socket not initialized');
    }
    // 保存玩家昵称到本地存储
    if (player?.name) {
      localStorage.setItem('playerName', player.name);
    }
    setPage('lobby');
  };

  if (page === 'home') {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center bg-indigo-900 bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-900">
        <div className="container mx-auto w-full max-w-sm">
          <div className="flex flex-col items-center justify-center min-h-[80vh] fade-in">
            <div className="flex items-center mb-12">
              <div className="text-5xl md:text-7xl mr-3 text-yellow-300 animate-pulse">🌙</div>
              <h1 className="text-3xl md:text-6xl font-bold text-yellow-300 drop-shadow-lg">月亮娱乐</h1>
            </div>
            {error && (
              <div className="bg-red-500 text-white p-4 rounded-lg mb-6 w-full shadow-lg">
                {error}
              </div>
            )}
            <div className="w-full mb-8 flex justify-center px-4">
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full max-w-xs px-4 py-4 bg-white border border-yellow-500 rounded-full text-black text-lg md:text-xl placeholder-gray-500 text-center focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all"
                placeholder="请输入你的昵称"
              />
            </div>
            <button
              onClick={handleEnterGame}
              className="px-10 py-3 bg-yellow-500 bg-gradient-to-r from-yellow-400 to-yellow-600 text-white font-bold rounded-full shadow-xl hover:shadow-2xl transition-all transform hover:scale-105 mb-12 w-full max-w-xs"
            >
              进入游戏
            </button>
            <div className="mt-6 w-full bg-gradient-to-br from-purple-800 to-indigo-900 p-4 md:p-8 rounded-xl border border-purple-600 shadow-2xl">
              <h3 className="text-lg md:text-2xl font-bold text-yellow-300 text-center mb-3 md:mb-6">游戏规则</h3>
              <ul className="text-left space-y-2 md:space-y-4">
                <li className="flex items-start">
                  <span className="text-yellow-400 mr-2 text-lg">•</span>
                  <span className="text-gray-200 text-sm md:text-base">4副牌，支持最多6人同时游戏</span>
                </li>
                <li className="flex items-start">
                  <span className="text-yellow-400 mr-2 text-lg">•</span>
                  <span className="text-gray-200 text-sm md:text-base">初始每人10000积分，最低下注100</span>
                </li>
                <li className="flex items-start">
                  <span className="text-yellow-400 mr-2 text-lg">•</span>
                  <span className="text-gray-200 text-sm md:text-base">玩家可申请坐庄，轮流坐庄</span>
                </li>
                <li className="flex items-start">
                  <span className="text-yellow-400 mr-2 text-lg">•</span>
                  <span className="text-gray-200 text-sm md:text-base">21点最大，超过21点爆牌输</span>
                </li>
                <li className="flex items-start">
                  <span className="text-yellow-400 mr-2 text-lg">•</span>
                  <span className="text-gray-200 text-sm md:text-base">庄家小于17点必须要牌</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (page === 'lobby') {
    return (
      <div className="min-h-screen p-4 bg-green-900 bg-gradient-to-br from-green-900 to-green-800">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 fade-in">
            <h2 className="text-2xl md:text-3xl font-bold text-yellow-400 mb-4 md:mb-0">游戏大厅</h2>
            <div className="bg-gradient-to-r from-green-800 to-green-900 p-3 md:p-4 rounded-lg border border-green-600 shadow-lg">
              <div className="text-white font-medium text-sm md:text-base">{player.name}</div>
              <div className="text-yellow-400 font-bold text-sm md:text-base">积分: {player.score}</div>
            </div>
          </div>
          <hr className="border-green-600 mb-6" />
          <div className="flex flex-col gap-3 mb-8 items-center">
            <button
              onClick={handleCreateRoom}
              className="px-6 py-3 bg-green-600 bg-gradient-to-r from-green-500 to-green-700 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all w-full max-w-xs"
            >
              创建房间
            </button>
            <div className="w-full max-w-xs flex justify-center">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full px-4 py-3 bg-white bg-opacity-10 border border-green-500 rounded-full text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-center"
                placeholder="输入6位房间号"
                maxLength={6}
              />
            </div>
            <button
              onClick={handleJoinRoom}
              className="px-6 py-3 bg-blue-600 bg-gradient-to-r from-blue-500 to-blue-700 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all w-full max-w-xs"
            >
              加入房间
            </button>
          </div>
          <div className="mb-6">
            <h3 className="text-xl md:text-2xl font-bold text-yellow-400 mb-4">公开房间</h3>
            {rooms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map((room) => (
                  <div key={room.id} className="bg-gradient-to-br from-green-800 to-green-900 p-4 rounded-lg border border-green-600 shadow-lg fade-in">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-bold text-yellow-400 text-sm md:text-lg">房间 {room.id}</span>
                      <span className="text-xs md:text-sm bg-green-700 px-2 py-1 rounded-full">{room.players.length}/6</span>
                    </div>
                    <div className="text-xs md:text-sm mb-4 space-y-1">
                      {room.players.map((player, index) => (
                        <div key={index} className="flex items-center text-white">
                          <span className="text-yellow-400 mr-1">👤</span>
                          {player.name}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => handleJoinExistingRoom(room.id)}
                      className="w-full px-4 py-2 bg-blue-600 bg-gradient-to-r from-blue-500 to-blue-700 text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all"
                    >
                      加入
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gradient-to-br from-green-800 to-green-900 p-8 rounded-lg border border-green-600 shadow-xl text-center">
                <div className="text-3xl mb-3">🎲</div>
                <div className="text-gray-300 text-sm md:text-lg">暂无公开房间，创建一个吧！</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (page === 'game') {
    // 游戏进行中界面 - 包括下注、游戏中和游戏结束状态
    if (game) {
      return (
        <div className="min-h-screen p-4 bg-green-900 bg-gradient-to-br from-green-900 to-green-800">
          <div className="container mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 fade-in">
              <h2 className="text-2xl md:text-3xl font-bold text-yellow-400 mb-4 md:mb-0">游戏房间 {currentRoom}</h2>
              <div className="flex flex-col md:flex-row items-center gap-3">
                <button
                  onClick={handleLeaveRoom}
                  className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-full text-sm w-full md:w-auto"
                >
                  返回房间
                </button>
                <div className="bg-gradient-to-r from-green-800 to-green-900 p-3 rounded-lg border border-green-600 shadow-lg">
                  <div className="text-white font-medium text-sm">{player.name}</div>
                  <div className="text-yellow-400 font-bold text-sm">积分: {player.score}</div>
                </div>
              </div>
            </div>
            {error && (
              <div className="bg-red-500 text-white p-4 rounded-lg mb-6 w-full shadow-lg">
                {error}
              </div>
            )}
            <hr className="border-green-600 mb-6" />
            
            {/* 庄家区域 */}
            <div className="mb-6">
              {dealer && players.find(p => p.id === dealer) ? (
                <>
                  <h3 className="text-xl md:text-2xl font-bold text-yellow-400 mb-4">庄家 ({players.find(p => p.id === dealer)?.name || '未知'})</h3>
                  <div className="text-yellow-400 text-lg font-medium mb-3">
                    积分: {players.find(p => p.id === dealer)?.score || 0}
                  </div>
                  <div className="flex gap-3 mb-3">
                    {/* 庄家手牌 */}
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {game?.dealerHand?.map((card, index) => (
                        <div key={index} className={`${card.suit === '?' ? 'card-back' : 'card'} min-w-[80px]`}>
                          {card.suit === '?' ? (
                            <div className="text-xl md:text-2xl">🂠</div>
                          ) : (
                            <>
                              <div className={`text-xl md:text-2xl ${['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}`}>{card.suit}</div>
                              <div className={['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}>{card.value}</div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="text-white text-lg font-medium">
                    点数: {game?.dealerValue || '?'}
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <div className="text-white text-sm md:text-lg mb-3">庄家 (未知)</div>
                  <button
                    onClick={handleApplyDealer}
                    className="px-6 py-3 bg-green-600 bg-gradient-to-r from-green-500 to-green-700 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all"
                  >
                    申请坐庄
                  </button>
                </div>
              )}
            </div>
            
            {/* 玩家区域 */}
            <div className="mb-6">
              <h3 className="text-xl md:text-2xl font-bold text-yellow-400 mb-4">{player.name}</h3>
              
              {/* 下注区域 */}
              {console.log('Game state:', game?.gameState, 'Bet amount:', betAmount, 'Player score:', player?.score, 'Is dealer:', player?.id === dealer)}
              {game && (game.gameState === 'waiting' || game.gameState === 'betting') && player?.score > 0 && player?.id !== dealer && (
                <div className="mb-6">
                  <h4 className="text-lg font-medium text-white mb-3">下注</h4>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {[200, 500, 1000, 5000].map(amount => (
                      <button
                        key={amount}
                        onClick={() => {
                          setBetAmount(amount);
                        }}
                        disabled={amount > player?.score}
                        className={`px-4 py-2 rounded-full text-sm ${betAmount === amount ? 'bg-yellow-500 text-white' : amount > player?.score ? 'bg-gray-500 text-gray-300 cursor-not-allowed' : 'bg-green-700 hover:bg-green-600 text-white'}`}
                      >
                        {amount} 积分
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        const allInAmount = player?.score || 0;
                        setBetAmount(allInAmount);
                      }}
                      disabled={player?.score <= 0}
                      className={`px-4 py-2 rounded-full text-sm ${betAmount === (player?.score || 0) ? 'bg-yellow-500 text-white' : player?.score <= 0 ? 'bg-gray-500 text-gray-300 cursor-not-allowed' : 'bg-red-700 hover:bg-red-600 text-white'}`}
                    >
                      梭哈
                    </button>
                  </div>
                  <div className="mt-3 text-center text-white">
                    当前下注: {betAmount} 积分
                  </div>
                  <div className="mt-1 text-center text-yellow-400 font-medium">
                    状态: {betStatus}
                  </div>
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => {
                        console.log('点击确认下注，金额:', betAmount);
                        setBetStatus('下注中...');
                        if (socket) {
                          console.log('发送下注请求');
                          socket.emit('placeBet', betAmount);
                        } else {
                          console.log('Socket未初始化');
                        }
                      }}
                      disabled={betAmount > player?.score}
                      className={`px-6 py-3 rounded-full shadow-lg hover:shadow-xl transition-all ${betAmount > player?.score ? 'bg-gray-500 text-gray-300 cursor-not-allowed' : 'bg-blue-600 bg-gradient-to-r from-blue-500 to-blue-700 text-white font-bold'}`}
                    >
                      确认下注
                    </button>
                  </div>
                </div>
              )}
              {/* 观众状态 */}
              {game && (game.gameState === 'waiting' || game.gameState === 'betting') && player?.score <= 0 && (
                <div className="mb-6 p-4 bg-yellow-900 rounded-lg border border-yellow-600">
                  <div className="text-center text-yellow-400 font-bold text-lg mb-2">您的积分不足</div>
                  <div className="text-center text-white">您现在是观众，无法参与游戏</div>
                </div>
              )}
              
              {/* 游戏结束显示结果 */}
              {game?.gameState === 'ended' && player.id !== dealer && (
                <>
                  {/* 显示分牌后的两手牌结果 */}
                  {(() => {
                    const mainPlayer = game?.players?.find(p => p.id === player.id);
                    const splitPlayer = game?.players?.find(p => p.id === player.id + '_split');
                    
                    if (splitPlayer) {
                      // 分牌后显示两手牌结果
                      return (
                        <>
                          <div className="mb-6">
                            <h4 className="text-lg font-medium text-white mb-3">第一手牌</h4>
                            <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                              {mainPlayer?.hand?.map((card, index) => (
                                <div key={index} className="card min-w-[80px]">
                                  <div className={`text-xl md:text-2xl ${['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}`}>{card.suit}</div>
                                  <div className={['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}>{card.value}</div>
                                </div>
                              ))}
                            </div>
                            <div className="text-white text-lg font-medium mb-3">
                              点数: {mainPlayer?.value || 0}
                            </div>
                            <div className={`text-lg font-bold ${mainPlayer?.result === 'win' ? 'text-green-400' : mainPlayer?.result === 'lose' ? 'text-red-400' : 'text-yellow-400'}`}>
                              {mainPlayer?.result === 'win' ? '胜利！' : mainPlayer?.result === 'lose' ? '失败！' : '平局！'}
                            </div>
                            <div className="text-white mt-1">
                              {(() => {
                                if (mainPlayer?.result === 'win') {
                                  // 计算实际的积分变化
                                  const currentScore = mainPlayer?.score || lastScore;
                                  const scoreChange = currentScore - lastScore;
                                  return `赢得 ${Math.abs(scoreChange)} 积分`;
                                } else if (mainPlayer?.result === 'lose') {
                                  // 直接使用下注金额计算输掉的积分
                                  return `输掉 ${mainPlayer?.bet || 0} 积分`;
                                } else {
                                  return '平局，积分不变';
                                }
                              })()}
                            </div>
                          </div>
                          <div className="mb-6">
                            <h4 className="text-lg font-medium text-white mb-3">第二手牌</h4>
                            <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                              {splitPlayer?.hand?.map((card, index) => (
                                <div key={index} className="card min-w-[80px]">
                                  <div className={`text-xl md:text-2xl ${['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}`}>{card.suit}</div>
                                  <div className={['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}>{card.value}</div>
                                </div>
                              ))}
                            </div>
                            <div className="text-white text-lg font-medium mb-3">
                              点数: {splitPlayer?.value || 0}
                            </div>
                            <div className={`text-lg font-bold ${splitPlayer?.result === 'win' ? 'text-green-400' : splitPlayer?.result === 'lose' ? 'text-red-400' : 'text-yellow-400'}`}>
                              {splitPlayer?.result === 'win' ? '胜利！' : splitPlayer?.result === 'lose' ? '失败！' : '平局！'}
                            </div>
                            <div className="text-white mt-1">
                              {(() => {
                                if (splitPlayer?.result === 'win') {
                                  // 计算实际的积分变化
                                  const currentScore = splitPlayer?.score || lastScore;
                                  const scoreChange = currentScore - lastScore;
                                  return `赢得 ${Math.abs(scoreChange)} 积分`;
                                } else if (splitPlayer?.result === 'lose') {
                                  // 直接使用下注金额计算输掉的积分
                                  return `输掉 ${splitPlayer?.bet || 0} 积分`;
                                } else {
                                  return '平局，积分不变';
                                }
                              })()}
                            </div>
                          </div>
                        </>
                      );
                    } else {
                      // 未分牌时显示一手牌结果
                      return (
                        <>
                          <div className="flex gap-3 mb-6">
                            {/* 玩家手牌 */}
                            <div className="flex gap-2 overflow-x-auto pb-2">
                              {mainPlayer?.hand?.map((card, index) => (
                                <div key={index} className="card min-w-[80px]">
                                  <div className={`text-xl md:text-2xl ${['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}`}>{card.suit}</div>
                                  <div className={['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}>{card.value}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="text-white text-lg font-medium mb-6">
                            点数: {mainPlayer?.value || 0}
                          </div>
                          <div className="mb-6 p-4 rounded-lg bg-green-900">
                            <div className={`text-center text-2xl font-bold ${mainPlayer?.hand?.length === 2 && mainPlayer?.value === 21 ? 'text-green-400' : mainPlayer?.result === 'win' ? 'text-green-400' : mainPlayer?.result === 'lose' ? 'text-red-400' : 'text-yellow-400'}`}>
                              {mainPlayer?.hand?.length === 2 && mainPlayer?.value === 21 ? '黑杰克！' : mainPlayer?.result === 'win' ? '胜利！' : mainPlayer?.result === 'lose' ? '失败！' : '平局！'}
                            </div>
                            <div className="text-center text-white mt-2">
                              {(() => {
                                if (mainPlayer?.result === 'win') {
                                  // 计算实际的积分变化
                                  const currentScore = mainPlayer?.score || lastScore;
                                  const scoreChange = currentScore - lastScore;
                                  return `赢得 ${Math.abs(scoreChange)} 积分`;
                                } else if (mainPlayer?.result === 'lose') {
                                  // 直接使用下注金额计算输掉的积分
                                  return `输掉 ${mainPlayer?.bet || 0} 积分`;
                                } else {
                                  return '平局，积分不变';
                                }
                              })()}
                            </div>
                          </div>
                        </>
                      );
                    }
                  })()}
                </>
              )}
              
              {/* 游戏结束时庄家的显示 */}
              {game?.gameState === 'ended' && player.id === dealer && (
                <div className="text-center py-6">
                  <div className="text-yellow-400 text-xl font-bold mb-2">您是庄家</div>
                  <div className={`text-center text-2xl font-bold ${game?.players?.find(p => p.id === player.id)?.result === 'win' ? 'text-green-400' : game?.players?.find(p => p.id === player.id)?.result === 'lose' ? 'text-red-400' : 'text-yellow-400'}`}>
                    {game?.players?.find(p => p.id === player.id)?.result === 'win' ? '胜利！' : game?.players?.find(p => p.id === player.id)?.result === 'lose' ? '失败！' : '平局！'}
                  </div>
                  <div className="text-center text-white mt-2">
                    {(() => {
                      const currentPlayer = game?.players?.find(p => p.id === player.id);
                      if (!currentPlayer) return '平局，积分不变';
                      
                      // 计算实际的积分变化
                      let scoreChange = 0;
                      // 庄家的积分变化：赢的下注总和 - 输的下注总和
                      const losingPlayers = game?.players?.filter(p => p.id !== dealer && p.result === 'lose');
                      const winningPlayers = game?.players?.filter(p => p.id !== dealer && p.result === 'win');
                      const totalLosingBets = losingPlayers?.reduce((sum, p) => sum + p.bet, 0) || 0;
                      const totalWinningBets = winningPlayers?.reduce((sum, p) => sum + p.bet, 0) || 0;
                      scoreChange = Math.abs(totalLosingBets - totalWinningBets);
                      
                      return currentPlayer.result === 'win' ? `赢得 ${scoreChange} 积分` : currentPlayer.result === 'lose' ? `输掉 ${scoreChange} 积分` : '平局，积分不变';
                    })()}
                  </div>
                </div>
              )}
              
              {/* 游戏结束显示下一局按钮 */}
              {game?.gameState === 'ended' && (
                <div className="mt-6 text-center">
                  <button
                    onClick={handleRestartGame}
                    className="px-6 py-3 bg-green-600 bg-gradient-to-r from-green-500 to-green-700 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all w-full md:w-auto"
                  >
                    下一局
                  </button>
                </div>
              )}
              
              {/* 如果玩家不是庄家，显示手牌和操作按钮 */}
              {player.id !== dealer && game?.gameState !== 'ended' && game?.gameState !== 'waiting' && game?.gameState !== 'betting' && player?.score > 0 && (
                <>
                  {/* 显示分牌后的两手牌 */}
                  {(() => {
                    const mainPlayer = game?.players?.find(p => p.id === player.id);
                    const splitPlayer = game?.players?.find(p => p.id === player.id + '_split');
                    
                    if (splitPlayer) {
                      // 分牌后显示两手牌
                      return (
                        <>
                          <div className="mb-6">
                            <h4 className="text-lg font-medium text-white mb-3">第一手牌</h4>
                            <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                              {mainPlayer?.hand?.map((card, index) => (
                                <div key={index} className="card min-w-[80px]">
                                  <div className={`text-xl md:text-2xl ${['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}`}>{card.suit}</div>
                                  <div className={['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}>{card.value}</div>
                                </div>
                              ))}
                            </div>
                            <div className="text-white text-lg font-medium mb-6">
                              点数: {mainPlayer?.value || 0}
                            </div>
                            {/* 第一手牌的操作按钮 */}
                            {mainPlayer?.status === 'playing' && (
                              <div className="flex gap-3 flex-wrap justify-center mb-6">
                                <button 
                                  onClick={() => handlePlayerAction('hit', 0)}
                                  className="px-4 py-2 bg-green-600 bg-gradient-to-r from-green-500 to-green-700 text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all"
                                >
                                  第一手牌要牌
                                </button>
                                <button 
                                  onClick={() => handlePlayerAction('stand', 0)}
                                  className="px-4 py-2 bg-blue-600 bg-gradient-to-r from-blue-500 to-blue-700 text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all"
                                >
                                  第一手牌停牌
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="mb-6">
                            <h4 className="text-lg font-medium text-white mb-3">第二手牌</h4>
                            <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                              {splitPlayer?.hand?.map((card, index) => (
                                <div key={index} className="card min-w-[80px]">
                                  <div className={`text-xl md:text-2xl ${['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}`}>{card.suit}</div>
                                  <div className={['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}>{card.value}</div>
                                </div>
                              ))}
                            </div>
                            <div className="text-white text-lg font-medium mb-6">
                              点数: {splitPlayer?.value || 0}
                            </div>
                            {/* 第二手牌的操作按钮 */}
                            {splitPlayer?.status === 'playing' && (
                              <div className="flex gap-3 flex-wrap justify-center mb-6">
                                <button 
                                  onClick={() => handlePlayerAction('hit', 1)}
                                  className="px-4 py-2 bg-green-600 bg-gradient-to-r from-green-500 to-green-700 text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all"
                                >
                                  第二手牌要牌
                                </button>
                                <button 
                                  onClick={() => handlePlayerAction('stand', 1)}
                                  className="px-4 py-2 bg-blue-600 bg-gradient-to-r from-blue-500 to-blue-700 text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all"
                                >
                                  第二手牌停牌
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      );
                    } else {
                      // 未分牌时显示一手牌
                      return (
                        <>
                          <div className="flex gap-3 mb-6">
                            {/* 玩家手牌 */}
                            <div className="flex gap-2 overflow-x-auto pb-2">
                              {mainPlayer?.hand?.map((card, index) => (
                                <div key={index} className="card min-w-[80px]">
                                  <div className={`text-xl md:text-2xl ${['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}`}>{card.suit}</div>
                                  <div className={['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}>{card.value}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="text-white text-lg font-medium mb-6">
                            点数: {mainPlayer?.value || 0}
                          </div>
                          
                          {/* 游戏进行中显示操作按钮 */}
                          {game?.gameState === 'playing' && mainPlayer?.status === 'playing' && (
                            <div className="flex gap-3 flex-wrap justify-center">
                              {/* 保险按钮 - 当庄家明牌是A时显示 */}
                              {game?.dealerHand?.[0]?.value === 'A' && mainPlayer?.hand?.length === 2 && (
                                <button 
                                  onClick={() => handlePlayerAction('insurance')}
                                  className="px-4 py-2 bg-orange-600 bg-gradient-to-r from-orange-500 to-orange-700 text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all"
                                >
                                  保险
                                </button>
                              )}
                              <button 
                                onClick={() => handlePlayerAction('hit')}
                                className="px-4 py-2 bg-green-600 bg-gradient-to-r from-green-500 to-green-700 text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all"
                              >
                                要牌
                              </button>
                              <button 
                                onClick={() => handlePlayerAction('stand')}
                                className="px-4 py-2 bg-blue-600 bg-gradient-to-r from-blue-500 to-blue-700 text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all"
                              >
                                停牌
                              </button>
                              {/* 加倍按钮 - 只在初始两张牌时显示 */}
                              {mainPlayer?.hand?.length === 2 && (
                                <button 
                                  onClick={() => handlePlayerAction('double')}
                                  className="px-4 py-2 bg-yellow-600 bg-gradient-to-r from-yellow-500 to-yellow-700 text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all"
                                >
                                  加倍
                                </button>
                              )}
                              {/* 分牌按钮 - 只在初始两张牌且点数相同时显示 */}
                              {(() => {
                                const playerHand = mainPlayer?.hand;
                                if (playerHand?.length === 2) {
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
                                  const value1 = getCardValue(playerHand[0]);
                                  const value2 = getCardValue(playerHand[1]);
                                  return value1 === value2;
                                }
                                return false;
                              })() ? (
                                <button 
                                  onClick={() => handlePlayerAction('split')}
                                  className="px-4 py-2 bg-purple-600 bg-gradient-to-r from-purple-500 to-purple-700 text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all"
                                >
                                  分牌
                                </button>
                              ) : null}
                              {/* 投降按钮 - 只在初始两张牌时显示 */}
                              {mainPlayer?.hand?.length === 2 && (
                                <button 
                                  onClick={() => handlePlayerAction('surrender')}
                                  className="px-4 py-2 bg-gray-600 bg-gradient-to-r from-gray-500 to-gray-700 text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all"
                                >
                                  投降
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      );
                    }
                  })()}
                </>
              )}
              
              {/* 如果玩家是庄家，显示庄家提示 */}
              {player.id === dealer && game?.gameState !== 'ended' && game?.gameState !== 'waiting' && game?.gameState !== 'betting' && (
                <div className="text-center py-6">
                  <div className="text-yellow-400 text-xl font-bold mb-2">您是庄家</div>
                  <div className="text-white">庄家的操作将在所有玩家行动后自动进行</div>
                </div>
              )}
            </div>
            
            {/* 其他玩家 */}
            <div className="mb-6">
              <h3 className="text-xl md:text-2xl font-bold text-yellow-400 mb-4">其他玩家</h3>
              {players.filter(p => p.id !== player.id && p.id !== dealer && !p.id.includes('_split')).length > 0 ? (
                <div className="space-y-4">
                  {players.filter(p => p.id !== player.id && p.id !== dealer && !p.id.includes('_split')).map((otherPlayer) => (
                    <div key={otherPlayer.id} className="bg-gradient-to-br from-green-800 to-green-900 p-3 rounded-lg border border-green-600 shadow-md">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3">
                        <span className="font-bold text-white mb-2 md:mb-0">{otherPlayer.name}</span>
                        <div className="flex flex-wrap items-center gap-2">
                          {game?.gameState === 'waiting' && (
                            <span className={`text-sm font-medium ${otherPlayer.ready ? 'text-green-400' : 'text-yellow-400'}`}>
                              {otherPlayer.ready ? '已下注' : '未下注'}
                            </span>
                          )}
                          <span className={`text-sm font-medium ${otherPlayer.status === 'playing' ? 'text-blue-400' : otherPlayer.status === 'stood' ? 'text-green-400' : otherPlayer.status === 'busted' ? 'text-red-400' : 'text-gray-400'}`}>
                            {otherPlayer.status === 'playing' ? '正在要牌' : otherPlayer.status === 'stood' ? '已停牌' : otherPlayer.status === 'busted' ? '已爆牌' : '等待中'}
                          </span>
                          {game?.gameState === 'ended' && (
                            <span className={`text-sm font-medium ${otherPlayer.result === 'win' ? 'text-green-400' : otherPlayer.result === 'lose' ? 'text-red-400' : 'text-yellow-400'}`}>
                              {otherPlayer.result === 'win' ? '胜利' : otherPlayer.result === 'lose' ? '失败' : '平局'}
                            </span>
                          )}
                          <span className="text-yellow-400 font-medium text-sm">积分: {otherPlayer.score}</span>
                        </div>
                      </div>
                      {otherPlayer.bet > 0 && (
                        <div className="text-sm text-gray-300 mb-2">
                          下注: {otherPlayer.bet} 积分
                        </div>
                      )}
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {otherPlayer.hand.map((card, index) => (
                          <div key={index} className="card" style={{ minWidth: '60px', padding: '6px' }}>
                            <div className={['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}>{card.suit}</div>
                            <div className={['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}>{card.value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 text-sm text-gray-300">
                        点数: {otherPlayer.value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-300 py-6">
                  暂无其他玩家
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }
    
    // 游戏准备界面 - 仅在没有游戏状态时显示
    return (
      <div className="min-h-screen p-4 bg-green-900 bg-gradient-to-br from-green-900 to-green-800">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center mb-4">
            <div className="mb-3 md:mb-0">
              <h2 className="text-xl md:text-2xl font-bold text-yellow-400">房间号: {currentRoom}</h2>
              <div className="text-white text-sm md:text-base">玩家: {players.length}/6</div>
            </div>
            <button
              onClick={handleLeaveRoom}
              className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-full text-sm"
            >
              离开房间
            </button>
          </div>
          <hr className="border-green-600 mb-6" />
          
          {/* 当前庄家 */}
          <div className="mb-6">
            <h3 className="text-xl md:text-2xl font-bold text-yellow-400 text-center mb-4">当前庄家</h3>
            {dealer && players.find(p => p.id === dealer) ? (
              <div className="flex flex-col items-center py-4">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-500 flex items-center justify-center text-white text-xl md:text-2xl font-bold mb-3">
                  {players.find(p => p.id === dealer)?.name.charAt(0) || '?'}
                </div>
                <div className="text-white text-sm md:text-lg">
                  {players.find(p => p.id === dealer)?.name || '未知'}
                </div>
                <div className="text-yellow-400 text-sm">
                  积分: {players.find(p => p.id === dealer)?.score || 0}
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="text-white text-sm md:text-lg mb-3">暂无庄家</div>
                <button
                  onClick={handleApplyDealer}
                  className="px-6 py-3 bg-green-600 bg-gradient-to-r from-green-500 to-green-700 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all"
                >
                  申请坐庄
                </button>
              </div>
            )}
          </div>
          
          {/* 玩家列表 */}
          <div className="mb-6">
            <h3 className="text-xl md:text-2xl font-bold text-yellow-400 mb-4">玩家列表</h3>
            <div className="space-y-3">
              {players.map((gamePlayer) => (
                <div key={gamePlayer.id} className="bg-gradient-to-br from-green-800 to-green-900 p-3 rounded-lg border border-green-600 shadow-md flex flex-col md:flex-row justify-between items-center">
                  <div className="flex items-center mb-2 md:mb-0">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-red-500 flex items-center justify-center text-white font-bold mr-2 md:mr-3">
                      {gamePlayer.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-white font-bold text-sm md:text-base">{gamePlayer.name} {gamePlayer.id === player.id && '(你)'}{gamePlayer.id === dealer && ' (庄家)'}</div>
                      <div className="text-yellow-400 text-xs md:text-sm">积分: {gamePlayer.score}</div>
                      <div className="text-gray-300 text-xs md:text-sm">
                        下注: {gamePlayer.bet > 0 ? `${gamePlayer.bet} 积分` : '未下注'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    {gamePlayer.bet > 0 ? (
                      <span className="text-green-400 font-medium mr-2 md:mr-4 text-sm">已下注</span>
                    ) : (
                      <span className="text-yellow-400 font-medium mr-2 md:mr-4 text-sm">下注中</span>
                    )}
                    {gamePlayer.ready ? (
                      <span className="text-green-400 font-medium mr-2 md:mr-4 text-sm">已准备</span>
                    ) : (
                      <span className="text-gray-400 font-medium mr-2 md:mr-4 text-sm">未准备</span>
                    )}
                    {gamePlayer.id === player.id && (
                      <button
                        onClick={handleReadyGame}
                        className={`px-3 py-1 rounded-full text-sm ${gamePlayer.ready ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} text-white font-bold`}
                      >
                        {gamePlayer.ready ? '取消准备' : '准备游戏'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* 操作按钮 */}
          <div className="flex flex-wrap gap-3 justify-center mt-6">
            {owner === player.id && (
              <button
                onClick={() => socket.emit('startGame')}
                className="px-6 py-3 bg-blue-600 bg-gradient-to-r from-blue-500 to-blue-700 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all w-full md:w-auto"
              >
                开始游戏
              </button>
            )}
            <button
              onClick={handleCopyRoomId}
              className="px-6 py-3 bg-purple-600 bg-gradient-to-r from-purple-500 to-purple-700 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all w-full md:w-auto"
            >
              复制房间号
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default App;