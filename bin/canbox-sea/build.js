#!/usr/bin/env node
/**
 * SEA 构建脚本：编译 main.js -> canbox 可执行文件
 *
 * 用法: node build.js
 * 前置: 当前 Node 版本 >= 22（推荐 24+）
 *
 * 步骤:
 *   1. node --experimental-sea-config sea-config.json  生成 sea-prep.blob
 *   2. 复制 node 二进制 -> canbox（Windows: canbox.exe，Linux: canbox）
 *   3. postject 注入 blob 到 canbox
 *   4. Windows: 修改 PE Subsystem 为 GUI 隐藏 console 窗口
 *      Linux/macOS: chmod +x（ELF/Mach-O 无 Subsystem 概念）
 *
 * 输出: ./canbox.exe (Windows) 或 ./canbox (Linux/macOS)，约 80-90MB
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const SEA_CONFIG = path.join(HERE, 'sea-config.json');
const BLOB_PATH = path.join(HERE, 'sea-prep.blob');
// Windows: canbox.exe | Linux/macOS: canbox（无扩展名）
const OUTPUT_NAME = process.platform === 'win32' ? 'canbox.exe' : 'canbox';
const OUTPUT_EXE = path.join(HERE, OUTPUT_NAME);

function log(msg) {
    console.log(`[sea-build] ${msg}`);
}

function fail(msg) {
    console.error(`[sea-build] ERROR: ${msg}`);
    process.exit(1);
}

// 1. 生成 blob
log('Step 1/3: Generating SEA blob...');
execSync(`node --experimental-sea-config "${SEA_CONFIG}"`, {
    cwd: HERE,
    stdio: 'inherit'
});
if (!fs.existsSync(BLOB_PATH)) {
    fail(`SEA blob not generated: ${BLOB_PATH}`);
}
log(`Blob generated: ${BLOB_PATH}`);

// 2. 复制 node.exe -> canbox.exe
log('Step 2/3: Copying node.exe -> canbox.exe...');
const nodeExe = process.execPath;
log(`Source node.exe: ${nodeExe}`);
fs.copyFileSync(nodeExe, OUTPUT_EXE);
log(`Copied to: ${OUTPUT_EXE}`);

// 3. postject 注入
log(`Step 3/3: Injecting blob into ${OUTPUT_NAME}...`);
const postjectArgs = [
    OUTPUT_NAME,
    'NODE_SEA_BLOB',
    'sea-prep.blob',
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
];
const result = spawnSync('npx', ['postject', ...postjectArgs], {
    cwd: HERE,
    stdio: 'inherit',
    shell: true
});
if (result.status !== 0) {
    fail(`postject injection failed (exit code ${result.status})`);
}
log('Injection done!');

// 4. 设置 SUBSYSTEM:WINDOWS 隐藏 console 窗口（仅 Windows）
// 纯 Node.js 修改 PE header，不需要 editbin
// Linux/macOS 是 ELF/Mach-O 格式，无此概念，且 GUI 程序不会弹终端窗口
if (process.platform === 'win32') {
    log('Step 4: Setting PE subsystem to WINDOWS_GUI (hide console window)...');
    setSubsystemToGUI(OUTPUT_EXE);
    log('Subsystem set to WINDOWS_GUI (console window hidden)');
} else {
    log('Step 4: Skipped (PE subsystem is Windows-only)');
    // Linux/macOS: 设置可执行权限
    try {
        fs.chmodSync(OUTPUT_EXE, 0o755);
        log(`chmod +x ${OUTPUT_NAME}`);
    } catch (e) {
        // 忽略权限设置失败
    }
}

log('=========================================');
log(`SUCCESS: ${OUTPUT_EXE}`);
log(`Size: ${(fs.statSync(OUTPUT_EXE).size / 1024 / 1024).toFixed(1)} MB`);
log('=========================================');

/**
 * 修改 PE header 的 Subsystem 字段从 CUI(3) 改为 GUI(2)
 * PE header 结构:
 *   - e_lfanew (offset 0x3C, 4 bytes): PE header offset
 *   - PE signature (4 bytes) + COFF header (20 bytes)
 *   - Optional header: Subsystem at offset 68
 * 所以 Subsystem 文件偏移 = e_lfanew + 24 + 68 = e_lfanew + 92
 */
function setSubsystemToGUI(exePath) {
    const fd = fs.openSync(exePath, 'r+');
    try {
        // 读 e_lfanew
        const e_lfanewBuf = Buffer.alloc(4);
        fs.readSync(fd, e_lfanewBuf, 0, 4, 0x3C);
        const e_lfanew = e_lfanewBuf.readUInt32LE(0);

        // Subsystem 文件偏移
        const subsystemOffset = e_lfanew + 92;

        // 读当前 subsystem
        const subsystemBuf = Buffer.alloc(2);
        fs.readSync(fd, subsystemBuf, 0, 2, subsystemOffset);
        const currentSubsystem = subsystemBuf.readUInt16LE(0);

        const IMAGE_SUBSYSTEM_WINDOWS_GUI = 2;
        const IMAGE_SUBSYSTEM_WINDOWS_CUI = 3;

        if (currentSubsystem === IMAGE_SUBSYSTEM_WINDOWS_GUI) {
            log(`  Subsystem already GUI (2), no change needed`);
            return;
        }

        if (currentSubsystem !== IMAGE_SUBSYSTEM_WINDOWS_CUI) {
            log(`  WARNING: Unexpected subsystem value ${currentSubsystem}, expected 3 (CUI)`);
        }

        // 改为 GUI
        const newBuf = Buffer.alloc(2);
        newBuf.writeUInt16LE(IMAGE_SUBSYSTEM_WINDOWS_GUI, 0);
        fs.writeSync(fd, newBuf, 0, 2, subsystemOffset);

        log(`  Subsystem changed: ${currentSubsystem} (CUI) -> ${IMAGE_SUBSYSTEM_WINDOWS_GUI} (GUI)`);
    } finally {
        fs.closeSync(fd);
    }
}
