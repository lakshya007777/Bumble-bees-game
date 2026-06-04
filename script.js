const canvas = document.getElementById('canvas1');
const ctx = canvas.getContext('2d');
const collisionCanvas = document.getElementById('collisionCanvas');
const collisionCtx = collisionCanvas.getContext('2d');

// Set canvas dimensions
function resizeCanvases() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    collisionCanvas.width = window.innerWidth;
    collisionCanvas.height = window.innerHeight;
}
resizeCanvases();
window.addEventListener('resize', resizeCanvases);

// Game States
const STATES = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER'
};
let gameState = STATES.MENU;

// Audio Settings & Setup
let isSoundEnabled = true;
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!isSoundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'hit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(1100, now + 0.12);
        gainNode.gain.setValueAtTime(0.25, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
    } else if (type === 'miss') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
    } else if (type === 'lifeLost') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.setValueAtTime(120, now + 0.08);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
    } else if (type === 'gameOver') {
        const notes = [280, 220, 160, 100];
        notes.forEach((freq, idx) => {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.connect(g);
            g.connect(audioCtx.destination);
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(freq, now + idx * 0.15);
            g.gain.setValueAtTime(0.2, now + idx * 0.15);
            g.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.15 + 0.18);
            o.start(now + idx * 0.15);
            o.stop(now + idx * 0.15 + 0.22);
        });
    } else if (type === 'highScore') {
        const notes = [380, 480, 580, 780];
        notes.forEach((freq, idx) => {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.connect(g);
            g.connect(audioCtx.destination);
            o.type = 'triangle';
            o.frequency.setValueAtTime(freq, now + idx * 0.08);
            g.gain.setValueAtTime(0.18, now + idx * 0.08);
            g.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.12);
            o.start(now + idx * 0.08);
            o.stop(now + idx * 0.08 + 0.18);
        });
    } else if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(550, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.04);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
    }
}

// Preloading Skins
const ravenImage = new Image();
ravenImage.src = 'raven.png';

// Game Settings
let score = 0;
let totalClicks = 0;
let totalHits = 0;
let lives = 3;
const maxLives = 3;
let gameMode = 'survival'; // 'survival' or 'timeAttack'
let gameDifficulty = 'medium'; // 'easy', 'medium', 'hard'
let targetSkin = 'raven'; // 'raven', 'skeleton'
let playerName = 'Hunter';
let timeRemaining = 60; // seconds for Time Attack
const gameDurationLimit = 60; // Max time in Time Attack

let timeToNextRaven = 0;
let ravenInterval = 500;
let lastTime = 0;
let animationId = null;
let activePlayTime = 0; // seconds elapsed this session
let hudOffset = 80; // HUD height boundary

let ravens = [];
let particles = [];
let floatingTexts = [];

// Banish Target Class
class Target {
    constructor() {
        this.skin = targetSkin;
        this.sizeModifier = Math.random() * 0.5 + 0.45; // Size between 45% and 95%
        
        this.width = 110 * this.sizeModifier;
        this.height = 110 * this.sizeModifier;
        this.image = ravenImage;

        this.x = canvas.width;
        // Keep inside canvas vertically, avoiding HUD overlay at the top
        this.y = Math.random() * (canvas.height - hudOffset - this.height) + hudOffset;

        // Scale speeds according to difficulty settings
        let minXSpeed = 3.5;
        let maxXSpeed = 6.0;
        if (gameDifficulty === 'easy') {
            minXSpeed = 2.0;
            maxXSpeed = 4.0;
        } else if (gameDifficulty === 'hard') {
            minXSpeed = 6.0;
            maxXSpeed = 10.0;
        }

        this.directionX = Math.random() * (maxXSpeed - minXSpeed) + minXSpeed;
        this.directionY = Math.random() * 4 - 2; // small drift up and down
        this.markedForDeletion = false;

        // Custom rgb identifiers for collision checking
        this.randomColors = [
            Math.floor(Math.random() * 255),
            Math.floor(Math.random() * 255),
            Math.floor(Math.random() * 255)
        ];
        this.color = 'rgb(' + this.randomColors[0] + ',' + this.randomColors[1] + ',' + this.randomColors[2] + ')';
        
        // Wing animation variable for raven squash effect
        this.flapTimer = Math.random() * 10;
        this.flapSpeed = Math.random() * 0.18 + 0.12;
    }

    update(deltatime) {
        // Bounce off screen margins
        const topBound = hudOffset;
        const bottomBound = canvas.height - this.height;
        if (this.y < topBound || this.y > bottomBound) {
            this.directionY = this.directionY * -1;
        }

        this.x -= this.directionX;
        this.y += this.directionY;

        // Target reached left boundary
        if (this.x < 0 - this.width) {
            this.markedForDeletion = true;
            if (gameState === STATES.PLAYING) {
                if (gameMode === 'survival') {
                    loseLife();
                } else {
                    // Time attack: just miss penalty (decrease accuracy count indirectly)
                    totalClicks++; 
                    floatingTexts.push(new FloatingText('ESCAPED', 40, this.y + this.height / 2, true));
                    playSound('lifeLost');
                }
            }
        }

        // Animate wing flap
        this.flapTimer += this.flapSpeed;
    }

    draw() {
        // Draw to collision tracking canvas
        collisionCtx.fillStyle = this.color;
        collisionCtx.fillRect(this.x, this.y, this.width, this.height);

        // Draw visual sprite on screen
        if (ravenImage.complete) {
            ctx.save();
            ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
            
            // Tilt target according to velocity direction
            const angle = (this.directionY / this.directionX) * 0.45;
            ctx.rotate(angle);
            
            // Scale vertically for a flapping simulation
            const scaleY = 1 + Math.sin(this.flapTimer) * 0.16;
            ctx.drawImage(ravenImage, -this.width / 2, (-this.height * scaleY) / 2, this.width, this.height * scaleY);
            ctx.restore();
        }
    }
}

// Particle feedback
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 4 + 3;
        this.speedX = Math.random() * 5 - 2.5;
        this.speedY = Math.random() * 5 - 3;
        this.gravity = 0.1;
        this.decay = Math.random() * 0.016 + 0.012;
        this.opacity = 1;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.speedY += this.gravity;
        this.opacity -= this.decay;
        if (this.size > 0.2) this.size -= 0.08;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        if (targetSkin === 'skeleton') {
            // Draw bone fragments
            ctx.fillRect(this.x, this.y, this.size, this.size);
        } else {
            // Draw feathers
            ctx.ellipse(this.x, this.y, this.size, this.size * 0.4, Math.PI / 4, 0, 2 * Math.PI);
            ctx.fill();
        }
        ctx.restore();
    }
}

// Floating click texts
class FloatingText {
    constructor(text, x, y, isMiss = false) {
        this.text = text;
        this.x = x;
        this.y = y;
        this.isMiss = isMiss;
        this.opacity = 1;
        this.scale = 0.8;
        this.speedY = -1.4;
        this.markedForDeletion = false;
    }

    update() {
        this.y += this.speedY;
        this.opacity -= 0.024;
        if (this.scale < 1.3) this.scale += 0.035;
        if (this.opacity <= 0) this.markedForDeletion = true;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.font = `700 ${Math.floor(20 * this.scale)}px 'Space Grotesk', sans-serif`;
        ctx.textAlign = 'center';
        if (this.isMiss) {
            ctx.fillStyle = '#ff3e6c';
            ctx.shadowColor = 'rgba(255, 62, 108, 0.7)';
        } else {
            ctx.fillStyle = '#ffdc6c';
            ctx.shadowColor = 'rgba(255, 220, 108, 0.7)';
        }
        ctx.shadowBlur = 8;
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

// Spawn particles
function spawnParticles(x, y, color) {
    const amount = 16;
    // Mix in dark/purple particles for aesthetic flair
    const particleColor = '#170c2a';
    for (let i = 0; i < amount; i++) {
        particles.push(new Particle(x, y, i % 2 === 0 ? color : particleColor));
    }
}

// Screen shake action
function triggerScreenShake() {
    document.body.classList.add('screen-shake');
    setTimeout(() => {
        document.body.classList.remove('screen-shake');
    }, 150);
}

// Decrement lives in Survival Mode
function loseLife() {
    lives--;
    playSound('lifeLost');
    triggerScreenShake();
    
    // Update hearts DOM state
    const hearts = document.querySelectorAll('.heart');
    hearts.forEach(heart => {
        const index = parseInt(heart.getAttribute('data-life'));
        if (index > lives) {
            heart.classList.add('lost');
        }
    });

    if (lives <= 0) {
        gameOver();
    }
}

// Game Over transition
function gameOver() {
    changeState(STATES.GAME_OVER);
    playSound('gameOver');

    // Calculate final parameters
    const accuracy = totalClicks > 0 ? Math.round((totalHits / totalClicks) * 100) : 0;
    
    // Save to LocalStorage score history
    const isNewHigh = saveSession(playerName, score, accuracy, totalHits, totalClicks, gameMode, gameDifficulty);

    if (isNewHigh) {
        playSound('highScore');
        document.getElementById('new-high-score-badge').classList.remove('hidden');
    } else {
        document.getElementById('new-high-score-badge').classList.add('hidden');
    }

    // Populate game over summaries
    document.getElementById('summary-score').innerText = score;
    document.getElementById('summary-accuracy').innerText = accuracy + '%';
    document.getElementById('summary-ratio').innerText = `${totalHits} / ${totalClicks}`;
    
    // Capitalize mode title
    const modeLabel = gameMode === 'survival' ? 'Survival' : 'Time Attack';
    const diffLabel = gameDifficulty.charAt(0).toUpperCase() + gameDifficulty.slice(1);
    document.getElementById('summary-mode').innerText = `${modeLabel} (${diffLabel})`;

    // Custom headers
    const titleEl = document.getElementById('game-over-title');
    const msgEl = document.getElementById('game-over-message');
    if (gameMode === 'timeAttack') {
        titleEl.innerText = "TIME'S UP!";
        msgEl.innerText = "The timer ran out. Excellent hunting!";
        titleEl.classList.remove('danger');
    } else {
        titleEl.innerText = "HUNT OVER";
        msgEl.innerText = "You were overwhelmed by the darkness.";
        titleEl.classList.add('danger');
    }
}

// LocalStorage Integration
function getHistory() {
    const raw = localStorage.getItem('shadow_hunter_history');
    return raw ? JSON.parse(raw) : [];
}

function saveSession(name, score, accuracy, hits, clicks, mode, difficulty) {
    const history = getHistory();
    const formattedDate = new Date().toLocaleString([], {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    const newRecord = {
        id: Date.now(),
        name: name || 'Anonymous',
        score: score,
        accuracy: accuracy,
        hits: hits,
        clicks: clicks,
        mode: mode,
        difficulty: difficulty,
        date: formattedDate
    };

    history.push(newRecord);
    localStorage.setItem('shadow_hunter_history', JSON.stringify(history));

    // Update menus
    loadHighScore();

    // Check if new mode-difficulty high score
    const recordsSameConfig = history.filter(r => r.mode === mode && r.difficulty === difficulty);
    const maxScore = Math.max(...recordsSameConfig.map(r => r.score), 0);
    return score >= maxScore && score > 0;
}

function loadHighScore() {
    const history = getHistory();
    const maxScore = history.reduce((max, r) => r.score > max ? r.score : max, 0);
    const hsEl = document.getElementById('menu-high-score');
    if (hsEl) hsEl.innerText = maxScore;
}

// State Machine transitions
function changeState(newState) {
    gameState = newState;
    
    // Hide all overlay screens
    document.querySelectorAll('.overlay-screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    const hud = document.getElementById('game-hud');
    hud.classList.add('hidden');

    if (gameState === STATES.MENU) {
        document.getElementById('main-menu').classList.add('active');
        // Clear background canvas draw when sitting on menu
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        collisionCtx.clearRect(0, 0, canvas.width, canvas.height);
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    } 
    else if (gameState === STATES.PLAYING) {
        hud.classList.remove('hidden');
    } 
    else if (gameState === STATES.PAUSED) {
        hud.classList.remove('hidden');
        document.getElementById('pause-screen').classList.add('active');
    } 
    else if (gameState === STATES.GAME_OVER) {
        hud.classList.remove('hidden');
        document.getElementById('game-over-screen').classList.add('active');
    }
}

// Start a fresh Game Session
function startGame() {
    // Collect settings
    const nameEl = document.getElementById('player-name');
    playerName = nameEl ? (nameEl.value.trim() || 'Hunter') : 'Hunter';

    // Speed configuration
    if (gameDifficulty === 'easy') {
        ravenInterval = 750;
    } else if (gameDifficulty === 'hard') {
        ravenInterval = 320;
    } else {
        ravenInterval = 480;
    }

    // Reset scores & meters
    score = 0;
    totalClicks = 0;
    totalHits = 0;
    activePlayTime = 0;

    // Reset modes
    const hearts = document.querySelectorAll('.heart');
    if (gameMode === 'survival') {
        lives = maxLives;
        hearts.forEach(heart => heart.classList.remove('lost'));
        document.getElementById('hud-survival-lives').classList.remove('hidden');
        document.getElementById('hud-time-attack').classList.add('hidden');
    } else { // Time attack
        timeRemaining = gameDurationLimit;
        document.getElementById('hud-survival-lives').classList.add('hidden');
        document.getElementById('hud-time-attack').classList.remove('hidden');
        document.getElementById('hud-timer-fill').style.width = '100%';
        document.getElementById('hud-timer-text').innerText = '60s';
    }

    // Reset lists
    ravens = [];
    particles = [];
    floatingTexts = [];

    // Reset loop timestamps
    lastTime = performance.now();
    timeToNextRaven = 0;

    updateHUD();
    changeState(STATES.PLAYING);

    // Kickoff frame loop
    if (!animationId) {
        animate(lastTime);
    }
}

// HUD value updates
function updateHUD() {
    document.getElementById('hud-name-display').innerText = playerName;
    document.getElementById('hud-score').innerText = score;
}

// Core Game Loop
function animate(timestamp) {
    if (gameState === STATES.MENU) {
        return;
    }

    if (gameState === STATES.PLAYING) {
        let deltatime = timestamp - lastTime;
        lastTime = timestamp;
        
        // Safety lock for background tab suspensions
        if (deltatime > 150) deltatime = 16; 

        // Update active seconds clock
        activePlayTime += deltatime / 1000;

        // Clean layers
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        collisionCtx.clearRect(0, 0, canvas.width, canvas.height);

        // Spawn targets
        timeToNextRaven += deltatime;
        if (timeToNextRaven > ravenInterval) {
            ravens.push(new Target());
            timeToNextRaven = 0;
            // Draw smaller targets behind larger ones
            ravens.sort((a, b) => a.width - b.width);
        }

        // Render targets
        ravens.forEach(target => target.update(deltatime));
        ravens.forEach(target => target.draw());
        ravens = ravens.filter(target => !target.markedForDeletion);

        // Render particles
        particles.forEach(p => p.update());
        particles.forEach(p => p.draw());
        particles = particles.filter(p => p.opacity > 0);

        // Render Floating popups
        floatingTexts.forEach(ft => ft.update());
        floatingTexts.forEach(ft => ft.draw());
        floatingTexts = floatingTexts.filter(ft => !ft.markedForDeletion);

        // Time Attack updates
        if (gameMode === 'timeAttack') {
            timeRemaining -= deltatime / 1000;
            if (timeRemaining <= 0) {
                timeRemaining = 0;
                document.getElementById('hud-timer-fill').style.width = '0%';
                document.getElementById('hud-timer-text').innerText = '0s';
                gameOver();
            } else {
                const fillRatio = (timeRemaining / gameDurationLimit) * 100;
                const fillEl = document.getElementById('hud-timer-fill');
                fillEl.style.width = fillRatio + '%';
                document.getElementById('hud-timer-text').innerText = Math.ceil(timeRemaining) + 's';
                
                // Color scaling as timer drops
                if (fillRatio < 25) {
                    fillEl.style.background = 'linear-gradient(to right, #ff3e6c, #ff7e9e)';
                } else if (fillRatio < 50) {
                    fillEl.style.background = 'linear-gradient(to right, #ffa500, #ffdc6c)';
                } else {
                    fillEl.style.background = 'linear-gradient(to right, #00f0ff, #00ff66)';
                }
            }
        }
    }

    animationId = requestAnimationFrame(animate);
}

// Mouse Click Hit Detections
window.addEventListener('pointerdown', function(e) {
    if (gameState !== STATES.PLAYING) return;

    // Check if clicked element lies inside HUD or interactive overlays
    if (e.target.closest('#game-hud') || e.target.closest('.overlay-screen')) {
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const clickY = (e.clientY - rect.top) * (canvas.height / rect.height);

    totalClicks++;
    let hitFound = false;

    // Read pixel color from collision buffer
    const detectPixelColor = collisionCtx.getImageData(Math.floor(clickX), Math.floor(clickY), 1, 1);
    const pc = detectPixelColor.data;

    // Search targets for color code matches
    for (let i = 0; i < ravens.length; i++) {
        const target = ravens[i];
        if (Math.abs(target.randomColors[0] - pc[0]) < 8 &&
            Math.abs(target.randomColors[1] - pc[1]) < 8 &&
            Math.abs(target.randomColors[2] - pc[2]) < 8) {
            
            target.markedForDeletion = true;
            score++;
            totalHits++;
            hitFound = true;

            playSound('hit');
            spawnParticles(target.x + target.width / 2, target.y + target.height / 2, target.color);
            floatingTexts.push(new FloatingText('+1', clickX, clickY, false));
            break; // shot hit top target only
        }
    }

    if (!hitFound) {
        playSound('miss');
        floatingTexts.push(new FloatingText('MISS', clickX, clickY, true));
        triggerScreenShake();
    }

    updateHUD();
});

// Fullscreen Helper
function requestFullScreen() {
    const doc = document.documentElement;
    const reqFS = doc.requestFullscreen || doc.webkitRequestFullscreen || doc.mozRequestFullScreen || doc.msRequestFullscreen;
    if (reqFS) {
        try {
            const promise = reqFS.call(doc);
            if (promise) promise.catch(err => console.log(err));
        } catch(e) { console.log(e); }
    }
    
    // Attempt orientation lock
    if (screen.orientation && screen.orientation.lock) {
        try {
            screen.orientation.lock('landscape').catch(err => console.log('Orientation lock failed:', err));
        } catch (e) { console.log(e); }
    }
}

// Setup Main Menu Inputs
function initMenu() {
    loadHighScore();

    // Difficulty Selector logic
    const diffBtns = document.querySelectorAll('.diff-btn');
    diffBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            playSound('click');
            diffBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gameDifficulty = btn.getAttribute('data-diff');
        });
    });



    // Main Play Button -> Show Mode Screen
    document.getElementById('main-play-btn').addEventListener('click', () => {
        playSound('click');
        requestFullScreen(); // Request native fullscreen on first interaction
        document.getElementById('main-menu').classList.remove('active');
        
        const modeScreen = document.getElementById('mode-screen');
        // Force reflow for animation
        void modeScreen.offsetWidth; 
        modeScreen.classList.add('active');
    });

    // Mode Selection Buttons -> Start Game
    const modeBtns = document.querySelectorAll('.mode-start-btn');
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            playSound('click');
            gameMode = btn.getAttribute('data-mode');
            document.getElementById('mode-screen').classList.remove('active');
            document.getElementById('main-menu').classList.add('active'); // reset for next time
            startGame();
        });
    });

    // Cancel Mode Selection
    document.getElementById('cancel-mode-btn').addEventListener('click', () => {
        playSound('click');
        document.getElementById('mode-screen').classList.remove('active');
        document.getElementById('main-menu').classList.add('active');
    });

    // Sound Toggle handler
    const soundBtn = document.getElementById('sound-toggle-btn');
    soundBtn.addEventListener('click', () => {
        isSoundEnabled = !isSoundEnabled;
        soundBtn.innerText = isSoundEnabled ? '🔊' : '🔇';
        playSound('click');
    });

    // Pause triggers
    document.getElementById('pause-game-btn').addEventListener('click', () => {
        playSound('click');
        changeState(STATES.PAUSED);
    });

    // Resume triggers
    document.getElementById('resume-game-btn').addEventListener('click', () => {
        playSound('click');
        lastTime = performance.now(); // reset delta reference
        changeState(STATES.PLAYING);
    });

    // Restart inside pause
    document.getElementById('restart-game-btn').addEventListener('click', () => {
        playSound('click');
        startGame();
    });

    // Quit inside pause
    document.getElementById('quit-game-btn').addEventListener('click', () => {
        playSound('click');
        changeState(STATES.MENU);
    });

    // Restart in game over
    document.getElementById('game-over-restart-btn').addEventListener('click', () => {
        playSound('click');
        startGame();
    });

    // Main menu button in game over
    document.getElementById('game-over-menu-btn').addEventListener('click', () => {
        playSound('click');
        changeState(STATES.MENU);
    });
}

// Initialise the interface
initMenu();
changeState(STATES.MENU);