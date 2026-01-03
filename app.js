document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app-content');
    const container = document.querySelector('.container');

    const state = {
        isPlaying: false,
        count: 0,
        countdown: 4,
        totalTime: 0,
        soundEnabled: false,
        timeLimit: '',
        sessionComplete: false,
        timeLimitReached: false,
        inhaleTime: 4,
        exhaleTime: 6
    };

    let wakeLock = null;
    let audioContext = new (window.AudioContext || window.webkitAudioContext)();

    const icons = {
        play: `<svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
        pause: `<svg class="icon" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
        volume2: `<svg class="icon" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
        volumeX: `<svg class="icon" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`,
        rotateCcw: `<svg class="icon" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`,
        clock: `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`
    };

    function getInstruction(count) {
        switch (count) {
            case 0: return 'Inhale';
            case 1: return 'Exhale';
            default: return '';
        }
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function playTone() {
        if (state.soundEnabled && audioContext) {
            try {
                const oscillator = audioContext.createOscillator();
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
                oscillator.connect(audioContext.destination);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.1);
            } catch (e) {
                console.error('Error playing tone:', e);
            }
        }
    }

    let interval;
    let lastStateUpdate;

    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake lock is active');
            } catch (err) {
                console.error('Failed to acquire wake lock:', err);
            }
        } else {
            console.log('Wake Lock API not supported');
        }
    }

    function releaseWakeLock() {
        if (wakeLock !== null) {
            wakeLock.release()
                .then(() => {
                    wakeLock = null;
                    console.log('Wake lock released');
                })
                .catch(err => {
                    console.error('Failed to release wake lock:', err);
                });
        }
    }

    function togglePlay() {
        state.isPlaying = !state.isPlaying;
        if (state.isPlaying) {
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().then(() => {
                    console.log('AudioContext resumed');
                });
            }
            state.totalTime = 0;
            state.countdown = state.inhaleTime;
            state.count = 0;
            state.sessionComplete = false;
            state.timeLimitReached = false;
            playTone();
            startInterval();
            requestWakeLock();
        } else {
            clearInterval(interval);
            releaseWakeLock();
        }
        render();
    }

    function resetToStart() {
        state.isPlaying = false;
        state.totalTime = 0;
        state.countdown = state.inhaleTime;
        state.count = 0;
        state.sessionComplete = false;
        state.timeLimit = '';
        state.timeLimitReached = false;
        clearInterval(interval);
        releaseWakeLock();
        render();
    }

    function toggleSound() {
        state.soundEnabled = !state.soundEnabled;
        render();
    }

    function handleTimeLimitChange(e) {
        state.timeLimit = e.target.value.replace(/[^0-9]/g, '');
    }

    function startWithPreset(minutes) {
        state.timeLimit = minutes.toString();
        state.isPlaying = true;
        state.totalTime = 0;
        state.countdown = state.inhaleTime;
        state.count = 0;
        state.sessionComplete = false;
        state.timeLimitReached = false;
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('AudioContext resumed');
            });
        }
        playTone();
        startInterval();
        requestWakeLock();
        render();
    }

    function startInterval() {
        clearInterval(interval);
        const startTime = performance.now();
        const startTotalTime = state.totalTime;

        lastStateUpdate = performance.now();
        interval = setInterval(() => {
            const elapsed = Math.floor((performance.now() - startTime) / 1000);
            const newTotalTime = startTotalTime + elapsed;

            if (newTotalTime > state.totalTime) {
                state.totalTime = newTotalTime;

                if (state.timeLimit && !state.timeLimitReached) {
                    const timeLimitSeconds = parseInt(state.timeLimit) * 60;
                    if (state.totalTime >= timeLimitSeconds) {
                        state.timeLimitReached = true;
                    }
                }

                // Recalculate cycle position
                const cycleTime = state.inhaleTime + state.exhaleTime;
                // Offset by existing cycle progress if needed, but since we reset on toggle play, 
                // straightforward modulo is usually enough unless resuming mid-cycle.
                // However, the original logic had simple state.countdown decrement.
                // To keep it perfectly robust to drift, we should calculate based on total time.
                // But the original logic also allowed resuming. 
                // Let's stick closer to the original "step" logic but gated by actual seconds passing
                // so we don't accidentally skip phase transitions if we jump too far, 
                // OR adapt the logic to compute exact current state from totalTime.

                // For a simple fix that feels like the original:
                // We typically increment time by 1s. If we jumped multiple seconds (drift),
                // we should theoretically run the logic multiple times or compute the new state.
                // Computing new state is safer.

                // However, to strictly follow "stay identical apart from...", let's keep it simple:
                // We know totalTime increased. Let's rely on that total time to derive the cycle.

                // But `state.countdown` was managing the phase.
                // Let's simply simulate the ticks if we want identical behavior, 
                // OR better: derive phase from totalTime.
                // Original: start -> inhale (4s) -> exhale (6s) -> repeat.
                // Total cycle = 10s.
                // 0-3s: Inhale (4,3,2,1)
                // 4-9s: Exhale (6...1)
                // This assumes we always start at 0.

                // Wait, if we toggle pause/play, `state.totalTime` resets to 0 in `togglePlay`.
                // So `state.totalTime` IS the session time.
                // So we can map `state.totalTime % cycleTime` to the phase.

                // Let's refine the cycle logic to be stateless:
                const cyclePos = state.totalTime % cycleTime; // 0 to 9

                let newCount;
                let newCountdown;

                if (cyclePos < state.inhaleTime) {
                    // Inhale phase
                    newCount = 0;
                    newCountdown = state.inhaleTime - cyclePos;
                } else {
                    // Exhale phase
                    newCount = 1;
                    newCountdown = state.exhaleTime - (cyclePos - state.inhaleTime);
                }

                // Detect phase change for sound
                if (newCount !== state.count) {
                    playTone();
                } else if (cyclePos === 0 && state.totalTime > 0) {
                    // Wrapped around to Inhale start
                    playTone();
                }

                state.count = newCount;
                state.countdown = newCountdown;

                if (state.count === 0 && state.timeLimitReached) {
                    // Check if we just finished a full cycle and time limit is reached
                    // Original logic: if (state.countdown === 1) ... (prior to decrement)
                    // Here we are at the state AFTER the second has passed.
                    // If we are at the start of a new inhale (cyclePos === 0) and limit reached?
                    // Or just if we are in inhale phase and limit reached.
                    // Original logic stopped ONLY when switching from Exhale to Inhale.
                    // i.e. when `state.countdown === 1` (last sec of current phase) AND we are about to switch?
                    // Actually original:
                    // if (state.countdown === 1) {
                    //    state.count = (state.count + 1) % 2;
                    //    ...
                    //    if (state.count === 0 && state.timeLimitReached) -> Stop
                    // }
                    // So usage stops effectively at the end of an Exhale, before next Inhale starts.

                    // So if we just switched to Inhale (newCount === 0 && previousCount === 1)??
                    // Or simply: if (cyclePos === 0 && state.timeLimitReached)

                    if (cyclePos === 0 && state.timeLimitReached) {
                        state.sessionComplete = true;
                        state.isPlaying = false;
                        clearInterval(interval);
                        releaseWakeLock();
                    }
                }
            }

            lastStateUpdate = performance.now();
            render();
        }, 200); // Check more frequently than 1s to catch the second boundary quickly
    }

    function render() {
        let html = `
            <h1>Relaxing Breathing</h1>
        `;
        if (state.isPlaying) {
            html += `
                <div class="timer">Total Time: ${formatTime(state.totalTime)}</div>
                <div class="instruction">${getInstruction(state.count)}</div>
                <div class="countdown">${state.countdown}</div>
            `;
        }
        if (!state.isPlaying && !state.sessionComplete) {
            html += `
                <div class="settings">
                    <div class="form-group">
                        <label class="switch">
                            <input type="checkbox" id="sound-toggle" ${state.soundEnabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                        <label for="sound-toggle">
                            ${state.soundEnabled ? icons.volume2 : icons.volumeX}
                            Sound ${state.soundEnabled ? 'On' : 'Off'}
                        </label>
                    </div>
                    <div class="form-group">
                        <input
                            type="number"
                            inputmode="numeric"
                            placeholder="Time limit (minutes)"
                            value="${state.timeLimit}"
                            id="time-limit"
                            step="1"
                            min="0"
                        >
                        <label for="time-limit">Minutes (optional)</label>
                    </div>
                </div>
                <div class="prompt">Press start to begin</div>
            `;
        }
        if (state.sessionComplete) {
            html += `<div class="complete">Complete!</div>`;
        }
        if (!state.sessionComplete) {
            html += `
                <button id="toggle-play">
                    ${state.isPlaying ? icons.pause : icons.play}
                    ${state.isPlaying ? 'Pause' : 'Start'}
                </button>
            `;
        }
        if (!state.isPlaying && !state.sessionComplete) {
            html += `
                <div class="slider-container">
                    <label for="exhale-time-slider">Exhale Time (seconds): <span id="exhale-time-value">${state.exhaleTime}</span></label>
                    <input type="range" min="6" max="8" step="1" value="${state.exhaleTime}" id="exhale-time-slider">
                </div>
            `;
        }
        if (state.sessionComplete) {
            html += `
                <button id="reset">
                    ${icons.rotateCcw}
                    Back to Start
                </button>
            `;
        }
        if (!state.isPlaying && !state.sessionComplete) {
            html += `
                <div class="shortcut-buttons">
                    <button id="preset-2min" class="preset-button">
                        ${icons.clock} 2 min
                    </button>
                    <button id="preset-5min" class="preset-button">
                        ${icons.clock} 5 min
                    </button>
                    <button id="preset-10min" class="preset-button">
                        ${icons.clock} 10 min
                    </button>
                </div>
            `;
        }
        app.innerHTML = html;

        if (!state.sessionComplete) {
            document.getElementById('toggle-play').addEventListener('click', togglePlay);
        }
        if (state.sessionComplete) {
            document.getElementById('reset').addEventListener('click', resetToStart);
        }
        if (!state.isPlaying && !state.sessionComplete) {
            document.getElementById('sound-toggle').addEventListener('change', toggleSound);
            const timeLimitInput = document.getElementById('time-limit');
            timeLimitInput.addEventListener('input', handleTimeLimitChange);
            const exhaleTimeSlider = document.getElementById('exhale-time-slider');
            exhaleTimeSlider.addEventListener('input', function () {
                state.exhaleTime = parseInt(this.value);
                document.getElementById('exhale-time-value').textContent = state.exhaleTime;
            });
            document.getElementById('preset-2min').addEventListener('click', () => startWithPreset(2));
            document.getElementById('preset-5min').addEventListener('click', () => startWithPreset(5));
            document.getElementById('preset-10min').addEventListener('click', () => startWithPreset(10));
        }
    }

    render();

    // Offline notification logic
    const offlineNotification = document.getElementById('offline-notification');
    let offlineTimeout;

    function showOfflineNotification() {
        offlineNotification.style.display = 'block';
        clearTimeout(offlineTimeout);
        offlineTimeout = setTimeout(() => {
            offlineNotification.style.display = 'none';
        }, 5000);
    }

    function hideOfflineNotification() {
        offlineNotification.style.display = 'none';
        clearTimeout(offlineTimeout);
    }

    window.addEventListener('offline', showOfflineNotification);
    window.addEventListener('online', hideOfflineNotification);

    // Check initial state
    if (!navigator.onLine) {
        showOfflineNotification();
    }
});
