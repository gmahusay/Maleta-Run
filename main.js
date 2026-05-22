// --- UI Elements ---
const screens = {
  menu: document.getElementById('main-menu'),
  hud: document.getElementById('hud'),
  gameOver: document.getElementById('game-over')
};

const playerNameInput = document.getElementById('playerName');
const charOptions = document.querySelectorAll('.char-option');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const menuBtn = document.getElementById('menu-btn');

const hudName = document.getElementById('hud-name');
const hudRole = document.getElementById('hud-role');
const hudScore = document.getElementById('hud-score');
const hudAvatar = document.getElementById('hud-avatar');
const finalScore = document.getElementById('final-score');

// --- Canvas Setup ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let canvasWidth, canvasHeight;
function resizeCanvas() {
  const container = document.getElementById('game-container');
  canvasWidth = container.clientWidth;
  canvasHeight = container.clientHeight;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- Game State ---
let gameState = 'menu'; // menu, playing, gameover
let score = 0;
let gameSpeed = 6;
let animationId;
let selectedRole = 'presidente';
let selectedCharImgPath = '/assets/presidente.svg';

// --- Entities ---
const lanes = [-1, 0, 1]; // Left, Center, Right
let currentLane = 0; // Starts at center
let playerY = canvasHeight - 150;
let obstacles = [];
let coins = [];
let bgY = 0;
let playerAnimTime = 0;

// --- Assets ---
const images = {
  presidente: new Image(),
  senador: new Image(),
  kongresista: new Image(),
  maleta: new Image(),
  pera: new Image(),
  background: new Image(),
  tao: new Image(),
  pulis: new Image(),
  bus: new Image()
};
images.presidente.src = '/assets/presidente.svg';
images.senador.src = '/assets/senador.svg';
images.kongresista.src = '/assets/kongresista.svg';
images.maleta.src = '/assets/maleta.png';
images.pera.src = '/assets/pera.png';
images.background.src = '/assets/background.png';
images.tao.src = '/assets/tao.svg';
images.pulis.src = '/assets/pulis.svg';
images.bus.src = '/assets/bus.svg';

// --- Audio System (Synth) ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
let bgMusicInterval;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playTone(freq, type, duration, vol=0.1) {
  if(!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playCoinSound() { 
  playTone(880, 'sine', 0.1, 0.2); 
  playTone(1108, 'sine', 0.15, 0.2); 
}

function playCrashSound() { 
  playTone(150, 'sawtooth', 0.5, 0.3); 
  playTone(100, 'square', 0.5, 0.3); 
}

function startMusic() {
  if (bgMusicInterval) clearInterval(bgMusicInterval);
  const notes = [261.63, 329.63, 392.00, 523.25]; // C, E, G, C
  let step = 0;
  bgMusicInterval = setInterval(() => {
    if (gameState === 'playing') {
      playTone(notes[step % notes.length], 'triangle', 0.2, 0.05);
      step++;
    }
  }, 300);
}

function stopMusic() {
  if (bgMusicInterval) clearInterval(bgMusicInterval);
}

// --- Menu Logic ---
charOptions.forEach(opt => {
  opt.addEventListener('click', () => {
    charOptions.forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    selectedRole = opt.dataset.role;
    selectedCharImgPath = opt.dataset.img;
  });
});

function showScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  if (screenName === 'menu') screens.menu.classList.add('active');
  if (screenName === 'playing') screens.hud.classList.add('active');
  if (screenName === 'gameover') screens.gameOver.classList.add('active');
  gameState = screenName;
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
menuBtn.addEventListener('click', () => {
  showScreen('menu');
  drawMenuBackground();
});

function startGame() {
  initAudio();
  const name = playerNameInput.value.trim() || 'Pulitiko';
  hudName.textContent = name;
  hudRole.textContent = selectedRole;
  hudAvatar.src = selectedCharImgPath;
  
  score = 0;
  gameSpeed = 6;
  currentLane = 0;
  obstacles = [];
  coins = [];
  bgY = 0;
  hudScore.textContent = score;
  playerY = canvasHeight - 120;
  
  showScreen('playing');
  startMusic();
  
  if (animationId) cancelAnimationFrame(animationId);
  gameLoop();
}

// --- Input Handling ---
window.addEventListener('keydown', (e) => {
  if (gameState !== 'playing') return;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    if (currentLane > -1) currentLane--;
  } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    if (currentLane < 1) currentLane++;
  }
});

// Touch swipe for mobile
let touchStartX = 0;
window.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
});
window.addEventListener('touchend', e => {
  if (gameState !== 'playing') return;
  const touchEndX = e.changedTouches[0].screenX;
  if (touchEndX < touchStartX - 30) {
    if (currentLane > -1) currentLane--; // Swipe left
  } else if (touchEndX > touchStartX + 30) {
    if (currentLane < 1) currentLane++; // Swipe right
  }
});

// --- Game Loop & Rendering ---
function getLaneX(laneIndex) {
  const laneWidth = canvasWidth / 3;
  return (canvasWidth / 2) + (laneIndex * laneWidth);
}

function spawnEntities() {
  if (Math.random() < 0.02) {
    // Spawn Obstacle
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    const types = ['tao', 'pulis', 'bus'];
    const type = types[Math.floor(Math.random() * types.length)];
    const height = type === 'bus' ? 120 : 60;
    obstacles.push({
      lane: lane,
      y: -100,
      width: 60,
      height: height,
      type: type
    });
  }
  if (Math.random() < 0.03) {
    // Spawn Coin (Pera or Maleta)
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    // Ensure no obstacle is on the exact same spot
    const hasObstacle = obstacles.some(ob => ob.lane === lane && ob.y < 50);
    if (!hasObstacle) {
      const type = Math.random() < 0.2 ? 'maleta' : 'pera';
      const width = type === 'maleta' ? 60 : 50;
      const height = type === 'maleta' ? 60 : 50;
      coins.push({
        lane: lane,
        y: -100,
        width: width,
        height: height,
        type: type
      });
    }
  }
}

function drawBackground() {
  if (images.background.complete && images.background.width > 0) {
    const bgRatio = images.background.height / images.background.width;
    const drawHeight = canvasWidth * bgRatio;
    if (gameState === 'playing') bgY += gameSpeed;
    if (bgY >= drawHeight) bgY = 0;
    
    ctx.drawImage(images.background, 0, bgY, canvasWidth, drawHeight);
    ctx.drawImage(images.background, 0, bgY - drawHeight + 1, canvasWidth, drawHeight);
  } else {
    ctx.fillStyle = '#444';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    // Draw lanes
    ctx.strokeStyle = '#fff';
    ctx.setLineDash([20, 20]);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(canvasWidth/3, 0); ctx.lineTo(canvasWidth/3, canvasHeight);
    ctx.moveTo((canvasWidth/3)*2, 0); ctx.lineTo((canvasWidth/3)*2, canvasHeight);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawPlayer() {
  const playerX = getLaneX(currentLane);
  const size = 90;
  
  if (gameState === 'playing') {
    // Increase animation time based on game speed to make legs/bobbing look right
    playerAnimTime += 0.05 * gameSpeed; 
  } else {
    playerAnimTime = 0; // Reset animation when not playing
  }
  
  // Calculate driving animation offsets
  const bobbingY = Math.sin(playerAnimTime * 2) * 2; // subtle vibration
  const rotation = Math.cos(playerAnimTime) * 0.02; // very slight tilt

  ctx.save();
  ctx.translate(playerX, playerY + bobbingY);
  ctx.rotate(rotation);

  if (images[selectedRole].complete && images[selectedRole].width > 0) {
    ctx.drawImage(images[selectedRole], -size/2, -size/2, size, size);
  } else {
    ctx.fillStyle = 'blue';
    ctx.fillRect(-size/2, -size/2, size, size);
  }
  
  ctx.restore();
}

function updateAndDrawEntities() {
  // Update and draw coins (Pera & Maleta)
  for (let i = coins.length - 1; i >= 0; i--) {
    let c = coins[i];
    c.y += gameSpeed;
    
    const cx = getLaneX(c.lane);
    if (images[c.type] && images[c.type].complete && images[c.type].width > 0) {
      ctx.drawImage(images[c.type], cx - c.width/2, c.y - c.height/2, c.width, c.height);
    } else {
      ctx.fillStyle = c.type === 'maleta' ? 'brown' : 'gold';
      ctx.beginPath();
      ctx.arc(cx, c.y, c.width/2, 0, Math.PI*2);
      ctx.fill();
    }
    
    // Collision with player
    if (c.lane === currentLane && Math.abs(c.y - playerY) < 60) {
      const points = c.type === 'maleta' ? 200 : 50;
      score += points; 
      hudScore.textContent = score;
      playCoinSound();
      coins.splice(i, 1);
      
      gameSpeed = 6 + (score / 500) * 0.8; // increase difficulty smoothly
      continue;
    }
    
    // Remove if off screen
    if (c.y > canvasHeight + 100) coins.splice(i, 1);
  }

  // Update and draw obstacles
  for (let i = obstacles.length - 1; i >= 0; i--) {
    let o = obstacles[i];
    o.y += gameSpeed;
    
    const ox = getLaneX(o.lane);
    if (images[o.type] && images[o.type].complete && images[o.type].width > 0) {
      ctx.drawImage(images[o.type], ox - o.width/2, o.y - o.height/2, o.width, o.height);
    } else {
      ctx.fillStyle = 'red';
      ctx.fillRect(ox - o.width/2, o.y - o.height/2, o.width, o.height);
    }
    
    // Collision with player
    if (o.lane === currentLane && Math.abs(o.y - playerY) < (o.height/2 + 30)) {
      gameOver();
      return;
    }
    
    // Remove if off screen
    if (o.y > canvasHeight + 100) obstacles.splice(i, 1);
  }
}

function gameOver() {
  gameState = 'gameover';
  playCrashSound();
  stopMusic();
  finalScore.textContent = score;
  showScreen('gameover');
}

function drawMenuBackground() {
  if (gameState === 'menu') {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    drawBackground();
    animationId = requestAnimationFrame(drawMenuBackground);
  }
}

function gameLoop() {
  if (gameState !== 'playing') return;
  
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  
  drawBackground();
  spawnEntities();
  updateAndDrawEntities();
  drawPlayer();
  
  if (gameState === 'playing') {
    animationId = requestAnimationFrame(gameLoop);
  }
}

// Initial draw
images.background.onload = () => {
  drawMenuBackground();
};
