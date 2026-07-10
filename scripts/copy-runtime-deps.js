/**
 * 复制 manager 运行时依赖到目标目录
 * 用法: node scripts/copy-runtime-deps.js <src_node_modules> <dest_node_modules>
 *
 * 递归复制指定的包及其传递依赖，只复制运行时所需的主进程依赖。
 * 前端依赖（vue, element-plus 等）已由 vite 打包到 build/，不需要复制。
 */

const fs = require('fs');
const path = require('path');

const srcModules = path.resolve(process.argv[2]);
const destModules = path.resolve(process.argv[3]);

// 主进程运行时需要的根依赖
const runtimeDeps = ['adm-zip', 'nanoid', 'axios'];

const visited = new Set();

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        // 跳过 .bin 和其他特殊目录
        if (entry.name.startsWith('.')) continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function copyPackage(pkgName) {
    if (visited.has(pkgName)) return;
    visited.add(pkgName);

    const pkgDir = path.join(srcModules, pkgName);
    if (!fs.existsSync(pkgDir)) {
        // 处理 scoped packages (如 @types/xxx)
        console.warn(`[copy-runtime-deps] 警告: 包不存在: ${pkgName}`);
        return;
    }

    // 复制包目录
    const destPkgDir = path.join(destModules, pkgName);
    console.log(`  复制: ${pkgName}`);
    copyDir(pkgDir, destPkgDir);

    // 读取 package.json，递归处理依赖
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const deps = pkg.dependencies || {};
        for (const dep of Object.keys(deps)) {
            copyPackage(dep);
        }
    }
}

console.log('[copy-runtime-deps] 源:', srcModules);
console.log('[copy-runtime-deps] 目标:', destModules);
console.log('[copy-runtime-deps] 根依赖:', runtimeDeps.join(', '));

fs.mkdirSync(destModules, { recursive: true });

for (const dep of runtimeDeps) {
    copyPackage(dep);
}

console.log(`[copy-runtime-deps] 完成，共复制 ${visited.size} 个包`);
