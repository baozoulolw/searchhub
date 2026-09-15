/**
 * 共享 JSON 文件存储小工具
 * 提供：写互斥链（runExclusive） + 临时文件原子写（atomicWriteJson）。
 * 被 store.service / proxies.service / keys.service 复用，
 * 保证“读 -> 改 -> 整写”并发安全（同一时间只有一个读改写在执行），
 * 写文件时先写 .tmp 再 rename，读者绝不会读到写坏/半截的文件。
 */
import { writeFile, rename } from 'node:fs/promises';

/** 全局写互斥链：所有 JSON 写操作串行排队 */
let writeChain: Promise<unknown> = Promise.resolve();

/** 串行化执行 fn（排他访问），保证并发请求不会互相覆盖 */
export function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** 原子写：先写 tmp 再 rename，失败不影响原文件 */
export async function atomicWriteJson(file: string, obj: unknown): Promise<void> {
  await writeFile(file + '.tmp', JSON.stringify(obj, null, 2), 'utf-8');
  await rename(file + '.tmp', file);
}