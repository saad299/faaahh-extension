"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const path = require("path");
const cp = require("child_process");
const fs = require("fs");
const os = require("os");
// ─── Sound Generation ────────────────────────────────────────────────────────
/**
 * Generates a WAV file buffer with the "FAAAAH" sound using raw PCM math.
 * No external dependencies required — pure Node.js.
 */
function generateFaaaahWav(style, volume) {
    const sampleRate = 44100;
    const duration = style === 'dramatic' ? 1.8 : style === 'classic' ? 1.2 : 0.8;
    const numSamples = Math.floor(sampleRate * duration);
    const dataSize = numSamples * 2; // 16-bit samples
    const bufferSize = 44 + dataSize;
    const buf = Buffer.alloc(bufferSize);
    // WAV header
    buf.write('RIFF', 0);
    buf.writeUInt32LE(bufferSize - 8, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16); // chunk size
    buf.writeUInt16LE(1, 20); // PCM
    buf.writeUInt16LE(1, 22); // mono
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
    buf.writeUInt16LE(2, 32); // block align
    buf.writeUInt16LE(16, 34); // bits per sample
    buf.write('data', 36);
    buf.writeUInt32LE(dataSize, 40);
    const maxAmp = 32767 * Math.min(1, Math.max(0, volume));
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const progress = t / duration;
        let sample = 0;
        if (style === 'dramatic') {
            // Dramatic descending "FAAAAH": starts high and falls with harmonics
            const baseFreq = 520 - progress * 280; // 520 Hz → 240 Hz sweep
            const envelope = progress < 0.05
                ? progress / 0.05 // quick attack
                : progress < 0.7
                    ? 1.0 // sustain
                    : 1.0 - (progress - 0.7) / 0.3; // fade out
            sample =
                Math.sin(2 * Math.PI * baseFreq * t) * 0.5 +
                    Math.sin(2 * Math.PI * baseFreq * 2 * t) * 0.25 +
                    Math.sin(2 * Math.PI * baseFreq * 3 * t) * 0.15 +
                    // Add vibrato for drama
                    Math.sin(2 * Math.PI * (baseFreq + Math.sin(2 * Math.PI * 6 * t) * 8) * t) * 0.1;
            sample *= envelope;
        }
        else if (style === 'classic') {
            // Classic: steady then drop
            const baseFreq = progress < 0.3 ? 440 : 440 - (progress - 0.3) / 0.7 * 200;
            const envelope = progress < 0.1 ? progress / 0.1 : 1.0 - progress * 0.5;
            sample =
                Math.sin(2 * Math.PI * baseFreq * t) * 0.6 +
                    Math.sin(2 * Math.PI * baseFreq * 2 * t) * 0.3 +
                    Math.sin(2 * Math.PI * baseFreq * 0.5 * t) * 0.1;
            sample *= envelope;
        }
        else {
            // Mild: soft descending tone
            const baseFreq = 380 - progress * 100;
            const envelope = 1.0 - progress * 0.8;
            sample =
                Math.sin(2 * Math.PI * baseFreq * t) * 0.7 +
                    Math.sin(2 * Math.PI * baseFreq * 2 * t) * 0.2;
            sample *= envelope;
        }
        const pcm = Math.round(sample * maxAmp);
        buf.writeInt16LE(Math.max(-32768, Math.min(32767, pcm)), 44 + i * 2);
    }
    return buf;
}
/**
 * Writes a temporary WAV file and plays it using the OS's default audio player.
 */
async function playFaaaah(style, volume) {
    const wavBuf = generateFaaaahWav(style, volume);
    const tmpFile = path.join(os.tmpdir(), `faaaah_${Date.now()}.wav`);
    await fs.promises.writeFile(tmpFile, wavBuf);
    return new Promise((resolve) => {
        let cmd;
        const platform = os.platform();
        if (platform === 'darwin') {
            cmd = `afplay "${tmpFile}"`;
        }
        else if (platform === 'win32') {
            cmd = `powershell -c (New-Object Media.SoundPlayer '${tmpFile}').PlaySync()`;
        }
        else {
            // Linux: try aplay, then paplay, then sox
            cmd = `aplay "${tmpFile}" 2>/dev/null || paplay "${tmpFile}" 2>/dev/null || play "${tmpFile}" 2>/dev/null`;
        }
        const proc = cp.exec(cmd, () => {
            // Cleanup temp file after playing
            fs.unlink(tmpFile, () => { });
            resolve();
        });
        // Don't block extension if playback hangs
        setTimeout(() => {
            proc.kill();
            resolve();
        }, 5000);
    });
}
// ─── Test Failure Detection ───────────────────────────────────────────────────
const FAIL_PATTERNS = [
    /\b(FAIL|FAILED|FAILING)\b/i,
    /\b\d+\s+failed?\b/i,
    /✕|✗|❌/,
    /AssertionError/i,
    /Tests?\s+failed/i,
    /test\s+suite\s+failed/i,
    /\bERROR\b.*\btest/i,
    /npm\s+ERR!/i,
    /exit\s+code\s+[1-9]/i,
];
const PASS_PATTERNS = [
    /\b(PASS|PASSED|passing)\b/i,
    /All\s+tests?\s+passed/i,
    /\d+\s+passed/i,
    /✓|✔|✅/,
];
function looksLikeTestFailure(text) {
    const hasFail = FAIL_PATTERNS.some(p => p.test(text));
    if (!hasFail) {
        return false;
    }
    // Avoid false positives from lines that also have passing indicators
    const hasPass = PASS_PATTERNS.some(p => p.test(text));
    return hasFail && !hasPass;
}
// ─── Extension Activation ─────────────────────────────────────────────────────
let statusBarItem;
let isPlaying = false;
function activate(context) {
    // Status bar toggle
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'faaaah.toggle';
    updateStatusBar();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // Watch terminal output for test failures
    context.subscriptions.push(vscode.window.onDidWriteTerminalData(async (e) => {
        const config = vscode.workspace.getConfiguration('faaaah');
        if (!config.get('enabled', true)) {
            return;
        }
        if (isPlaying) {
            return;
        }
        if (looksLikeTestFailure(e.data)) {
            isPlaying = true;
            await triggerFaaaah();
            isPlaying = false;
        }
    }));
    // Watch task events (npm test, pytest, etc.)
    context.subscriptions.push(vscode.tasks.onDidEndTaskProcess(async (e) => {
        const config = vscode.workspace.getConfiguration('faaaah');
        if (!config.get('enabled', true)) {
            return;
        }
        if (isPlaying) {
            return;
        }
        const exitCode = e.exitCode ?? 0;
        const taskName = e.execution.task.name.toLowerCase();
        const isTestTask = taskName.includes('test') ||
            taskName.includes('jest') ||
            taskName.includes('pytest') ||
            taskName.includes('karma') ||
            taskName.includes('mocha') ||
            taskName.includes('vitest');
        if (isTestTask && exitCode !== 0) {
            isPlaying = true;
            await triggerFaaaah();
            isPlaying = false;
        }
    }));
    // Commands
    context.subscriptions.push(vscode.commands.registerCommand('faaaah.testSound', async () => {
        await triggerFaaaah();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('faaaah.toggle', () => {
        const config = vscode.workspace.getConfiguration('faaaah');
        const current = config.get('enabled', true);
        config.update('enabled', !current, vscode.ConfigurationTarget.Global);
        updateStatusBar();
        vscode.window.showInformationMessage(`FAAAAH is now ${!current ? '🔊 ON' : '🔇 OFF'}`);
    }));
    vscode.window.showInformationMessage('🔊 FAAAAH extension loaded. May your tests pass. 🙏');
}
async function triggerFaaaah() {
    const config = vscode.workspace.getConfiguration('faaaah');
    const volume = config.get('volume', 0.8);
    const style = config.get('soundStyle', 'dramatic');
    // Show notification
    vscode.window.showWarningMessage('💥 FAAAAH! Tests failed!');
    try {
        await playFaaaah(style, volume);
    }
    catch (err) {
        // Silently fail if audio doesn't work — don't annoy the dev more than the tests already did
        console.error('[FAAAAH] Could not play sound:', err);
    }
}
function updateStatusBar() {
    const config = vscode.workspace.getConfiguration('faaaah');
    const enabled = config.get('enabled', true);
    statusBarItem.text = enabled ? '$(unmute) FAAAAH' : '$(mute) FAAAAH';
    statusBarItem.tooltip = enabled
        ? 'FAAAAH is active — click to mute'
        : 'FAAAAH is muted — click to unmute';
}
function deactivate() {
    statusBarItem?.dispose();
}
//# sourceMappingURL=extension.js.map