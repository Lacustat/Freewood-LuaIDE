/* SPDX-License-Identifier: GPL-3.0-or-later  Copyright (C) 2026 Lacustat
 * INHALT / CONTENTS: __multi3-Ersatz (compiler-rt fehlt) · replacement for __multi3 (compiler-rt missing) */
/* Minimal replacement for compiler-rt __multi3 (128-bit multiply), which the sandbox lacks. */
typedef long long ti_lo; 
typedef unsigned long long u64;
typedef struct { u64 lo, hi; } u128s;
__attribute__((visibility("default"))) void __multi3(u128s *r, u64 alo, u64 ahi, u64 blo, u64 bhi) {
  u64 a0 = alo & 0xffffffffULL, a1 = alo >> 32, b0 = blo & 0xffffffffULL, b1 = blo >> 32;
  u64 p00 = a0 * b0, p01 = a0 * b1, p10 = a1 * b0, p11 = a1 * b1;
  u64 mid = (p00 >> 32) + (p01 & 0xffffffffULL) + (p10 & 0xffffffffULL);
  r->lo = (p00 & 0xffffffffULL) | (mid << 32);
  r->hi = p11 + (p01 >> 32) + (p10 >> 32) + (mid >> 32) + alo * bhi + ahi * blo;
}
