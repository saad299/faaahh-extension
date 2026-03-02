import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';

// ─── Sound Generation ────────────────────────────────────────────────────────

/**
 * Generates a WAV file buffer with the "FAAAAH" sound using raw PCM math.
 * No external dependencies required — pure Node.js.
 */
// function generateFaaaahWav(style: 'dramatic' | 'classic' | 'mild', volume: number): Buffer {
//   const sampleRate = 44100;
//   const duration = style === 'dramatic' ? 1.6 : style === 'classic' ? 1.1 : 0.7;
//   const numSamples = Math.floor(sampleRate * duration);
//   const dataSize = numSamples * 2;
//   const bufferSize = 44 + dataSize;
//   const buf = Buffer.alloc(bufferSize);

//   // WAV HEADER -------------------------------------------------------
//   buf.write('RIFF', 0);
//   buf.writeUInt32LE(bufferSize - 8, 4);
//   buf.write('WAVE', 8);
//   buf.write('fmt ', 12);
//   buf.writeUInt32LE(16, 16);
//   buf.writeUInt16LE(1, 20);
//   buf.writeUInt16LE(1, 22);
//   buf.writeUInt32LE(sampleRate, 24);
//   buf.writeUInt32LE(sampleRate * 2, 28);
//   buf.writeUInt16LE(2, 32);
//   buf.writeUInt16LE(16, 34);
//   buf.write('data', 36);
//   buf.writeUInt32LE(dataSize, 40);

//   // -----------------------------------------------------------------

//   const maxAmp = 32767 * Math.min(1, Math.max(0, volume));

//   for (let i = 0; i < numSamples; i++) {
//     const t = i / sampleRate;
//     const progress = t / duration;

//     // base pitch = scream-like, then drop
//     const baseFreq =
//       style === "dramatic"
//         ? 900 - progress * 700
//         : style === "classic"
//           ? 750 - progress * 550
//           : 600 - progress * 400;

//     // envelope: hard attack, long sustain, fast decay
//     const envelope =
//       progress < 0.02
//         ? progress / 0.02               // instant blast
//         : progress < 0.5
//           ? 1.0                            // loud plateau
//           : 1.0 - (progress - 0.5) / 0.5; // fast fade

//     // Create raspy vocal-like tone:
//     // - distorted sine
//     // - noise burst
//     // - formant peaks around 1k and 2.2k
//     let tone =
//       Math.sin(2 * Math.PI * baseFreq * t) +
//       0.6 * Math.sin(2 * Math.PI * baseFreq * 2 * t) +
//       0.3 * Math.sin(2 * Math.PI * 1000 * t) +
//       0.2 * Math.sin(2 * Math.PI * 2200 * t);

//     // Add noise (raspy scream)
//     tone += (Math.random() * 2 - 1) * 0.4;

//     // Add vibrato instability
//     tone += Math.sin(2 * Math.PI * (baseFreq + 20) * t * (1 + Math.sin(t * 8) * 0.2)) * 0.1;

//     // Distortion
//     tone = Math.tanh(tone * 2.5);

//     const sample = tone * envelope;
//     const pcm = Math.round(sample * maxAmp);
//     buf.writeInt16LE(Math.max(-32768, Math.min(32767, pcm)), 44 + i * 2);
//   }

//   return buf;
// }

/**
 * Writes a temporary WAV file and plays it using the OS's default audio player.
 */
async function playFaaaah(volume: number): Promise<void> {
  const soundFile = path.join(__dirname, '..', 'sounds', 'FAAHHH.wav');

  return new Promise((resolve) => {
    let cmd: string;
    const platform = os.platform();

    if (platform === 'darwin') {
      cmd = `afplay "${soundFile}"`;
    } else if (platform === 'win32') {
      cmd = `powershell -c (New-Object Media.SoundPlayer '${soundFile}').PlaySync()`;
    } else {
      cmd = `aplay "${soundFile}" 2>/dev/null || paplay "${soundFile}" 2>/dev/null`;
    }

    const proc = cp.exec(cmd, () => resolve());
    setTimeout(() => { proc.kill(); resolve(); }, 5000);
  });
}

// ─── Test Failure Detection ───────────────────────────────────────────────────

const FAIL_PATTERNS: RegExp[] = [
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

const PASS_PATTERNS: RegExp[] = [
  /\b(PASS|PASSED|passing)\b/i,
  /All\s+tests?\s+passed/i,
  /\d+\s+passed/i,
  /✓|✔|✅/,
];

function looksLikeTestFailure(text: string): boolean {
  const hasFail = FAIL_PATTERNS.some(p => p.test(text));
  if (!hasFail) { return false; }
  // Avoid false positives from lines that also have passing indicators
  const hasPass = PASS_PATTERNS.some(p => p.test(text));
  return hasFail && !hasPass;
}

// ─── Extension Activation ─────────────────────────────────────────────────────

let statusBarItem: vscode.StatusBarItem;
let isPlaying = false;

export function activate(context: vscode.ExtensionContext): void {
  // Status bar toggle
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'faaaah.toggle';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Watch terminal output for test failures
  context.subscriptions.push(
    vscode.window.onDidEndTerminalShellExecution(async (e) => {
      const config = vscode.workspace.getConfiguration('faaaah');
      if (!config.get<boolean>('enabled', true)) { return; }
      if (isPlaying) { return; }
      if (e.exitCode !== undefined && e.exitCode !== 0) {
        isPlaying = true;
        await triggerFaaaah();
        isPlaying = false;
      }
    })
  );

  // Watch task events (npm test, pytest, etc.)
  context.subscriptions.push(
    vscode.tasks.onDidEndTaskProcess(async (e) => {
      const config = vscode.workspace.getConfiguration('faaaah');
      if (!config.get<boolean>('enabled', true)) { return; }
      if (isPlaying) { return; }

      const exitCode = e.exitCode ?? 0;
      const taskName = e.execution.task.name.toLowerCase();
      const isTestTask =
        taskName.includes('test') ||
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
    })
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('faaaah.testSound', async () => {
      await triggerFaaaah();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('faaaah.toggle', () => {
      const config = vscode.workspace.getConfiguration('faaaah');
      const current = config.get<boolean>('enabled', true);
      config.update('enabled', !current, vscode.ConfigurationTarget.Global);
      updateStatusBar();
      vscode.window.showInformationMessage(
        `FAAAAH is now ${!current ? '🔊 ON' : '🔇 OFF'}`
      );
    })
  );

  vscode.window.showInformationMessage('🔊 FAAAAH extension loaded. May your tests pass. 🙏');
}

async function triggerFaaaah(): Promise<void> {
  const config = vscode.workspace.getConfiguration('faaaah');
  const volume = config.get<number>('volume', 0.8);

  // Show notification
  vscode.window.showWarningMessage('💥 FAAAAH! Tests failed!');

  try {
    await playFaaaah(volume);
  } catch (err) {
    // Silently fail if audio doesn't work — don't annoy the dev more than the tests already did
    console.error('[FAAAAH] Could not play sound:', err);
  }
}

function updateStatusBar(): void {
  const config = vscode.workspace.getConfiguration('faaaah');
  const enabled = config.get<boolean>('enabled', true);
  statusBarItem.text = enabled ? '$(unmute) FAAAAH' : '$(mute) FAAAAH';
  statusBarItem.tooltip = enabled
    ? 'FAAAAH is active — click to mute'
    : 'FAAAAH is muted — click to unmute';
}

export function deactivate(): void {
  statusBarItem?.dispose();
}
