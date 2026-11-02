// THE SAVES MODULE — import from 'src/saves'. README: framework/saves/README.md
export { createSave, backupKey, damagedKey, NOTES, type Save, type SlotSaves, type SaveKind, type SaveOptions, type SaveRecord, type SaveResult, type SavePeek, type LoadReport, type Upgrade } from './saves'
export { createRun, continueLine, timeAgo, RUN_WORDS, type Run, type RunOptions, type PendingRun, type ResumeResult } from './run'
export { recordRun, addRunMove, replayRun, sameResult, dailySeed, utcDay, REPLAY_WORDS, type RunRecord, type RunMove, type MoveBy, type ReplayRules, type ReplayResult } from './replay'
export { mergeRecords, deviceId, FIELD_RULES, EARLIER, type FieldRule, type FieldRules } from './progress'
export { fillMissing, copyData } from './fill'
export { browserStorage, memoryStorage, isFullError, setSavesStorage, savesStorage, savesOnNativeStorage, switchedStorage, type StorageLike, type MemoryStorage } from './storage'
export { openSaves, browserBackend, slowBackend, COPIED_MARKER, type SavesBackend, type OpenedSaves, type OpenSavesOptions, type SlowBackend } from './platform'
export { makeSaveCode, readSaveCode, saveFileName, downloadSaveFile, readSaveFile, copyText, gameLabel, CODE_WORDS, SAVE_CODE_FORMAT, type CodeResult } from './saveCode'
export { makeLinkCode, loadLinkCode, deleteLinkCode, linkCodeHere, cloudAddress, serverAddress, CLOUD_WORDS, CLOUD_PORT, type CloudOptions, type LinkResult } from './cloud'
export { handleCloud, memoryCloudRows, readLinkCode, showLinkCode, newLinkCode, LINK_ALPHABET, type CloudRows, type CloudContext } from './cloudRoutes'
export { boardAddress, keepForBoard, waitingForBoard, sendScore, loadBoard, removeMyScore, lastBoardName, newPlayerId, BOARD_WORDS, BOARD_PORT, type BoardOptions, type BoardDay, type BoardLine, type SendResult } from './board'
export { handleBoard, checkWaiting, tidyBoard, nextMidnight, memoryBoardRows, readArcadeName, sameSetup, keyedHash, BLOCKED_NAMES, type BoardGame, type BoardRows, type BoardScore, type WaitingGame, type BoardCount, type BoardContext } from './boardRoutes'
export { checkSaveHealth, askToKeepSaves, healthLine, browserEnv, HEALTH_WORDS, type SaveHealth, type SaveWarning, type WarningId, type HealthEnv } from './health'
export { createBackupNudge, NUDGE_WORDS, type BackupNudge } from './nudge'
export { SAVE_SETTINGS_ROWS, SAVE_CODE_ROW, SAVE_HEALTH_ROW } from './settingsRow'
// The Settings → "Save code" screen is in ./ui/SaveCodePanel, the Daily board in ./ui/BoardPanel, and the main menu's
// Continue in ./ui/useContinue (only in games with the UI kit — import them from there).
export { setSavesConfig, savesConfig, readSavesConfig, DEFAULT_SAVES_CONFIG, type SavesConfig, type NudgeConfig, type CloudConfig, type BoardConfig } from './config'
