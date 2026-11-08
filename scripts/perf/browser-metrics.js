// 브라우저 값(LCP·CLS·FCP·요청 수·전송량) — Aside 의 aside repl 에서 페이지 안에서 실행하는 함수 본문.
// 사용: page.evaluate(전체 파일 내용) → 열린 지 5초 뒤의 값을 돌려준다. 캐시 없는 첫 방문은 CDP Network.setCacheDisabled 로 만든다(docs/09-performance.md §14).
async () => {
  await new Promise((r) => setTimeout(r, 5000)); // 로드 뒤 늦게 오는 LCP 후보·레이아웃 이동을 기다린다
  const obs = (type) => new Promise((res) => {
    const out = [];
    new PerformanceObserver((l) => out.push(...l.getEntries())).observe({ type, buffered: true });
    setTimeout(() => res(out), 50);
  });
  const lcps = await obs("largest-contentful-paint");
  const shifts = await obs("layout-shift");
  const lcp = lcps[lcps.length - 1];
  const nav = performance.getEntriesByType("navigation")[0];
  const paint = Object.fromEntries(performance.getEntriesByType("paint").map((p) => [p.name, Math.round(p.startTime)]));
  const res = performance.getEntriesByType("resource");
  const group = (f) => {
    const xs = res.filter(f);
    return { n: xs.length, transferKb: Math.round(xs.reduce((s, x) => s + x.transferSize, 0) / 102.4) / 10, encodedKb: Math.round(xs.reduce((s, x) => s + x.encodedBodySize, 0) / 102.4) / 10, sizeUnknown: xs.filter((x) => x.transferSize === 0 && x.encodedBodySize === 0).length, maxDurMs: Math.round(Math.max(0, ...xs.map((x) => x.responseEnd - x.startTime))) };
  };
  const isImg = (x) => x.initiatorType === "img" || /\.(jpe?g|png|webp|avif)(\?|$)/.test(x.name) || x.name.includes("/_next/image");
  return {
    url: location.pathname + location.search,
    viewport: [innerWidth, innerHeight],
    ttfbMs: Math.round(nav.responseStart),
    fcpMs: paint["first-contentful-paint"] ?? null,
    lcpMs: lcp ? Math.round(lcp.startTime) : null,
    lcpEl: lcp ? { tag: lcp.element?.tagName ?? null, url: (lcp.url || "").slice(-70), size: lcp.size } : null,
    cls: Math.round(shifts.filter((s) => !s.hadRecentInput).reduce((s, x) => s + x.value, 0) * 1000) / 1000,
    dclMs: Math.round(nav.domContentLoadedEventEnd),
    loadMs: Math.round(nav.loadEventEnd),
    htmlKb: Math.round(nav.encodedBodySize / 102.4) / 10,
    requests: res.length,
    js: group((x) => x.initiatorType === "script" || /\.js(\?|$)/.test(x.name)),
    css: group((x) => /\.css(\?|$)/.test(x.name)),
    font: group((x) => /\.woff2?(\?|$)/.test(x.name)),
    img: group(isImg),
    imgExternal: { ...group((x) => isImg(x) && !x.name.startsWith(location.origin)), urls: res.filter((x) => isImg(x) && !x.name.startsWith(location.origin)).map((x) => x.name) },
    imgLocal: group((x) => isImg(x) && x.name.startsWith(location.origin)),
  };
}
