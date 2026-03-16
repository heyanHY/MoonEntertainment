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
  const [betAmount, setBetAmount] = useState(100);
  const [owner, setOwner] = useState(null);
  const [dealer, setDealer] = useState(null);
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    const newSocket = io('http://localhost:3005');
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
    if (socket) {
      socket.emit('placeBet', amount);
    } else {
      console.error('Socket not initialized');
    }
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
      <div className="min-h-screen p-4 flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-900">
        <div className="container mx-auto">
          <div className="flex flex-col items-center justify-center min-h-[80vh] fade-in">
            <div className="flex items-center mb-16">
              <div className="text-7xl mr-4 text-yellow-300 animate-pulse">🌙</div>
              <h1 className="text-6xl font-bold text-yellow-300 drop-shadow-lg">月亮娱乐</h1>
            </div>
            {error && (
              <div className="bg-red-500 text-white p-4 rounded-lg mb-8 w-full max-w-md shadow-lg">
                {error}
              </div>
            )}
            <div className="w-full max-w-md mb-10">
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full px-6 py-5 bg-white border border-yellow-500 rounded-full text-black text-xl placeholder-gray-500 text-center focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all"
                placeholder="请输入你的昵称"
              />
            </div>
            <button
              onClick={handleEnterGame}
              className="px-12 py-4 bg-gradient-to-r from-yellow-400 to-yellow-600 text-white font-bold rounded-full shadow-xl hover:shadow-2xl transition-all transform hover:scale-105 mb-16"
            >
              进入游戏
            </button>
            <div className="mt-8 w-full max-w-md bg-gradient-to-br from-purple-800 to-indigo-900 p-8 rounded-xl border border-purple-600 shadow-2xl">
              <h3 className="text-2xl font-bold text-yellow-300 text-center mb-6">游戏规则</h3>
              <ul className="text-left space-y-4">
                <li className="flex items-start">
                  <span className="text-yellow-400 mr-3 text-lg">•</span>
                  <span className="text-gray-200">4副牌，支持最多6人同时游戏</span>
                </li>
                <li className="flex items-start">
                  <span className="text-yellow-400 mr-3 text-lg">•</span>
                  <span className="text-gray-200">初始每人10000积分，最低下注100</span>
                </li>
                <li className="flex items-start">
                  <span className="text-yellow-400 mr-3 text-lg">•</span>
                  <span className="text-gray-200">玩家可申请坐庄，轮流坐庄</span>
                </li>
                <li className="flex items-start">
                  <span className="text-yellow-400 mr-3 text-lg">•</span>
                  <span className="text-gray-200">21点最大，超过21点爆牌输</span>
                </li>
                <li className="flex items-start">
                  <span className="text-yellow-400 mr-3 text-lg">•</span>
                  <span className="text-gray-200">庄家小于17点必须要牌</span>
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
      <div className="min-h-screen p-4">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 fade-in">
            <h2 className="section-title mb-4 md:mb-0">游戏大厅</h2>
            <div className="bg-gradient-to-r from-green-800 to-green-900 p-4 rounded-lg border border-green-600 shadow-lg">
              <div className="text-white font-medium">{player.name}</div>
              <div className="text-yellow-400 font-bold">积分: {player.score}</div>
            </div>
          </div>
          <hr className="border-green-600 mb-8" />
          <div className="flex flex-wrap gap-4 mb-12 justify-center">
            <button
              onClick={handleCreateRoom}
              className="btn-primary"
            >
              创建房间
            </button>
            <div className="w-full md:w-auto">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="input-field md:w-64"
                placeholder="输入6位房间号"
                maxLength={6}
              />
            </div>
            <button
              onClick={handleJoinRoom}
              className="btn-secondary"
            >
              加入房间
            </button>
          </div>
          <div className="mb-8">
            <h3 className="section-title">公开房间</h3>
            {rooms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {rooms.map((room) => (
                  <div key={room.id} className="room-card fade-in">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-bold text-yellow-400 text-lg">房间 {room.id}</span>
                      <span className="text-sm bg-green-700 px-3 py-1 rounded-full">{room.players.length}/6</span>
                    </div>
                    <div className="text-sm mb-6 space-y-2">
                      {room.players.map((player, index) => (
                        <div key={index} className="flex items-center text-white">
                          <span className="text-yellow-400 mr-2">👤</span>
                          {player.name}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => handleJoinExistingRoom(room.id)}
                      className="w-full btn-accent"
                    >
                      加入
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gradient-to-br from-green-800 to-green-900 p-12 rounded-lg border border-green-600 shadow-xl text-center">
                <div className="text-4xl mb-4">🎲</div>
                <div className="text-gray-300 text-lg">暂无公开房间，创建一个吧！</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (page === 'game') {
    // 游戏准备界面
    if (!game || game.gameState === 'waiting') {
      return (
        <div className="min-h-screen p-4 bg-gradient-to-br from-green-800 to-green-900">
          <div className="container mx-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-yellow-400">房间号: {currentRoom}</h2>
                <div className="text-white">玩家: {players.length}/6</div>
              </div>
              <button
                onClick={handleLeaveRoom}
                className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-full"
              >
                离开房间
              </button>
            </div>
            <hr className="border-green-600 mb-8" />
            
            {/* 当前庄家 */}
            <div className="game-section">
              <h3 className="section-title text-center">当前庄家</h3>
              {dealer ? (
                <div className="flex flex-col items-center py-6">
                  <div className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center text-white text-2xl font-bold mb-4">
                    {players.find(p => p.id === dealer)?.name.charAt(0) || '?'}
                  </div>
                  <div className="text-white text-lg">
                    {players.find(p => p.id === dealer)?.name || '未知'}
                  </div>
                  <div className="text-yellow-400">
                    积分: {players.find(p => p.id === dealer)?.score || 0}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-white text-lg mb-4">暂无庄家</div>
                  <button
                    onClick={handleApplyDealer}
                    className="btn-primary"
                  >
                    申请坐庄
                  </button>
                </div>
              )}
            </div>
            
            {/* 玩家列表 */}
            <div className="game-section mt-6">
              <h3 className="section-title">玩家列表</h3>
              <div className="space-y-4">
                {players.map((gamePlayer) => (
                  <div key={gamePlayer.id} className="bg-green-900 p-4 rounded-lg border border-green-700 shadow-md flex justify-between items-center">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white font-bold mr-3">
                        {gamePlayer.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-white font-bold">{gamePlayer.name} {gamePlayer.id === player.id && '(你)'}{gamePlayer.id === dealer && ' (庄家)'}</div>
                        <div className="text-yellow-400 text-sm">积分: {gamePlayer.score}</div>
                      </div>
                    </div>
                    <div className="flex items-center">
                      {gamePlayer.ready ? (
                        <span className="text-green-400 font-medium mr-4">已准备</span>
                      ) : (
                        <span className="text-gray-400 font-medium mr-4">未准备</span>
                      )}
                      {gamePlayer.id === player.id && (
                        <button
                          onClick={handleReadyGame}
                          className={`px-4 py-2 rounded-full ${gamePlayer.ready ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} text-white font-bold`}
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
            <div className="flex flex-wrap gap-4 justify-center mt-8">
              {owner === player.id && (
                <button
                  onClick={() => socket.emit('startGame')}
                  className="btn-secondary"
                >
                  开始游戏
                </button>
              )}
              <button
                onClick={handleCopyRoomId}
                className="btn-accent"
              >
                复制房间号
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    // 游戏进行中界面
    return (
      <div className="min-h-screen p-4">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 fade-in">
            <h2 className="section-title mb-4 md:mb-0">游戏房间 {currentRoom}</h2>
            <div className="flex items-center gap-4">
              <button
                onClick={handleLeaveRoom}
                className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-full"
              >
                返回房间
              </button>
              <div className="bg-gradient-to-r from-green-800 to-green-900 p-4 rounded-lg border border-green-600 shadow-lg">
                <div className="text-white font-medium">{player.name}</div>
                <div className="text-yellow-400 font-bold">积分: {player.score}</div>
              </div>
            </div>
          </div>
          <hr className="border-green-600 mb-8" />
          
          {/* 庄家区域 */}
          <div className="game-section">
            <h3 className="section-title">庄家 ({players.find(p => p.id === dealer)?.name || '未知'})</h3>
            <div className="flex gap-4 mb-4">
              {/* 庄家手牌 */}
              <div className="flex gap-3">
                {game?.dealerHand?.map((card, index) => (
                  <div key={index} className={`${card.suit === '?' ? 'card-back' : 'card'}`}>
                    {card.suit === '?' ? (
                      <div className="text-2xl">🂠</div>
                    ) : (
                      <>
                        <div className={`text-2xl ${['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}`}>{card.suit}</div>
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
          </div>
          
          {/* 玩家区域 */}
          <div className="game-section">
            <h3 className="section-title">{player.name}</h3>
            
            {/* 下注区域 */}
            {game && game.gameState === 'waiting' && (
              <div className="mb-6">
                <h4 className="text-lg font-medium text-white mb-3">下注</h4>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[100, 500, 1000, 5000].map(amount => (
                    <button
                      key={amount}
                      onClick={() => handleBet(amount)}
                      className={`px-4 py-2 rounded-full ${betAmount === amount ? 'bg-yellow-500 text-white' : 'bg-green-700 hover:bg-green-600 text-white'}`}
                    >
                      {amount} 积分
                    </button>
                  ))}
                </div>
                <div className="mt-3 text-center text-white">
                  当前下注: {betAmount} 积分
                </div>
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
                          <div className="flex gap-3 mb-3">
                            {mainPlayer?.hand?.map((card, index) => (
                              <div key={index} className="card">
                                <div className={`text-2xl ${['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}`}>{card.suit}</div>
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
                            {mainPlayer?.result === 'win' ? `赢得 ${mainPlayer?.bet || 0} 积分` : mainPlayer?.result === 'lose' ? `输掉 ${mainPlayer?.bet || 0} 积分` : '平局，积分不变'}
                          </div>
                        </div>
                        <div className="mb-6">
                          <h4 className="text-lg font-medium text-white mb-3">第二手牌</h4>
                          <div className="flex gap-3 mb-3">
                            {splitPlayer?.hand?.map((card, index) => (
                              <div key={index} className="card">
                                <div className={`text-2xl ${['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}`}>{card.suit}</div>
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
                            {splitPlayer?.result === 'win' ? `赢得 ${splitPlayer?.bet || 0} 积分` : splitPlayer?.result === 'lose' ? `输掉 ${splitPlayer?.bet || 0} 积分` : '平局，积分不变'}
                          </div>
                        </div>
                      </>
                    );
                  } else {
                    // 未分牌时显示一手牌结果
                    return (
                      <>
                        <div className="flex gap-4 mb-6">
                          {/* 玩家手牌 */}
                          <div className="flex gap-3">
                            {mainPlayer?.hand?.map((card, index) => (
                              <div key={index} className="card">
                                <div className={`text-2xl ${['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}`}>{card.suit}</div>
                                <div className={['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}>{card.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="text-white text-lg font-medium mb-6">
                          点数: {mainPlayer?.value || 0}
                        </div>
                        <div className="mb-6 p-4 rounded-lg bg-green-900">
                          <div className={`text-center text-2xl font-bold ${mainPlayer?.result === 'win' ? 'text-green-400' : mainPlayer?.result === 'lose' ? 'text-red-400' : 'text-yellow-400'}`}>
                            {mainPlayer?.result === 'win' ? '胜利！' : mainPlayer?.result === 'lose' ? '失败！' : '平局！'}
                          </div>
                          <div className="text-center text-white mt-2">
                            {mainPlayer?.result === 'win' ? `赢得 ${mainPlayer?.bet || 0} 积分` : mainPlayer?.result === 'lose' ? `输掉 ${mainPlayer?.bet || 0} 积分` : '平局，积分不变'}
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
              <div className="text-center py-8">
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
                  className="btn-primary"
                >
                  下一局
                </button>
              </div>
            )}
            
            {/* 如果玩家不是庄家，显示手牌和操作按钮 */}
            {player.id !== dealer && game?.gameState !== 'ended' && (
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
                          <div className="flex gap-3 mb-3">
                            {mainPlayer?.hand?.map((card, index) => (
                              <div key={index} className="card">
                                <div className={`text-2xl ${['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}`}>{card.suit}</div>
                                <div className={['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}>{card.value}</div>
                              </div>
                            ))}
                          </div>
                          <div className="text-white text-lg font-medium mb-6">
                            点数: {mainPlayer?.value || 0}
                          </div>
                          {/* 第一手牌的操作按钮 */}
                          {mainPlayer?.status === 'playing' && (
                            <div className="flex gap-4 flex-wrap justify-center mb-6">
                              <button 
                                onClick={() => handlePlayerAction('hit', 0)}
                                className="btn-accent"
                              >
                                第一手牌要牌
                              </button>
                              <button 
                                onClick={() => handlePlayerAction('stand', 0)}
                                className="btn-secondary"
                              >
                                第一手牌停牌
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="mb-6">
                          <h4 className="text-lg font-medium text-white mb-3">第二手牌</h4>
                          <div className="flex gap-3 mb-3">
                            {splitPlayer?.hand?.map((card, index) => (
                              <div key={index} className="card">
                                <div className={`text-2xl ${['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}`}>{card.suit}</div>
                                <div className={['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}>{card.value}</div>
                              </div>
                            ))}
                          </div>
                          <div className="text-white text-lg font-medium mb-6">
                            点数: {splitPlayer?.value || 0}
                          </div>
                          {/* 第二手牌的操作按钮 */}
                          {splitPlayer?.status === 'playing' && (
                            <div className="flex gap-4 flex-wrap justify-center mb-6">
                              <button 
                                onClick={() => handlePlayerAction('hit', 1)}
                                className="btn-accent"
                              >
                                第二手牌要牌
                              </button>
                              <button 
                                onClick={() => handlePlayerAction('stand', 1)}
                                className="btn-secondary"
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
                        <div className="flex gap-4 mb-6">
                          {/* 玩家手牌 */}
                          <div className="flex gap-3">
                            {mainPlayer?.hand?.map((card, index) => (
                              <div key={index} className="card">
                                <div className={`text-2xl ${['♥', '♦'].includes(card.suit) ? 'text-red-500' : 'text-black'}`}>{card.suit}</div>
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
                          <div className="flex gap-4 flex-wrap justify-center">
                            <button 
                              onClick={() => handlePlayerAction('hit')}
                              className="btn-accent"
                            >
                              要牌
                            </button>
                            <button 
                              onClick={() => handlePlayerAction('stand')}
                              className="btn-secondary"
                            >
                              停牌
                            </button>
                            {/* 加倍按钮 - 只在初始两张牌时显示 */}
                            {mainPlayer?.hand?.length === 2 && (
                              <button 
                                onClick={() => handlePlayerAction('double')}
                                className="btn-primary"
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
                                className="btn-accent"
                              >
                                分牌
                              </button>
                            ) : null}
                            {/* 投降按钮 - 只在初始两张牌时显示 */}
                            {mainPlayer?.hand?.length === 2 && (
                              <button 
                                onClick={() => handlePlayerAction('surrender')}
                                className="btn-secondary"
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
            {player.id === dealer && game?.gameState !== 'ended' && (
              <div className="text-center py-8">
                <div className="text-yellow-400 text-xl font-bold mb-2">您是庄家</div>
                <div className="text-white">庄家的操作将在所有玩家行动后自动进行</div>
              </div>
            )}
          </div>
          
          {/* 其他玩家 */}
          <div className="game-section">
            <h3 className="section-title">其他玩家</h3>
            {players.filter(p => p.id !== player.id && p.id !== dealer).length > 0 ? (
              <div className="space-y-6">
                {players.filter(p => p.id !== player.id && p.id !== dealer).map((otherPlayer) => (
                  <div key={otherPlayer.id} className="bg-green-900 p-4 rounded-lg border border-green-700 shadow-md">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-bold text-white">{otherPlayer.name}</span>
                      <div className="flex items-center gap-4">
                        <span className={`text-sm font-medium ${otherPlayer.status === 'playing' ? 'text-blue-400' : otherPlayer.status === 'stood' ? 'text-green-400' : otherPlayer.status === 'busted' ? 'text-red-400' : 'text-gray-400'}`}>
                          {otherPlayer.status === 'playing' ? '正在要牌' : otherPlayer.status === 'stood' ? '已停牌' : otherPlayer.status === 'busted' ? '已爆牌' : '等待中'}
                        </span>
                        {game?.gameState === 'ended' && (
                          <span className={`text-sm font-medium ${otherPlayer.result === 'win' ? 'text-green-400' : otherPlayer.result === 'lose' ? 'text-red-400' : 'text-yellow-400'}`}>
                            {otherPlayer.result === 'win' ? '胜利' : otherPlayer.result === 'lose' ? '失败' : '平局'}
                          </span>
                        )}
                        <span className="text-yellow-400 font-medium">积分: {otherPlayer.score}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {otherPlayer.hand.map((card, index) => (
                        <div key={index} className="card" style={{ minWidth: '70px', padding: '8px' }}>
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
              <div className="text-center text-gray-300 py-8">
                暂无其他玩家
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default App;