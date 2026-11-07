// [cards] 텍스트 줄바꿈 — PNG 내보내기(캔버스)가 화면(CSS)과 같은 줄을 만들도록 쓰는 순수 함수.
// 줄바꿈 문자는 그대로 줄을 나누고, 한 줄이 maxWidth 를 넘으면 공백에서, 공백이 없으면(한글 긴 낱말 등) 글자 단위로 나눈다.

export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (para === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const token of para.split(/(\s+)/).filter((t) => t !== "")) {
      if (measure(line + token) <= maxWidth) {
        line += token;
        continue;
      }
      if (line !== "") {
        out.push(line.trimEnd());
        line = "";
      }
      if (/^\s+$/.test(token)) continue;
      if (measure(token) <= maxWidth) {
        line = token;
        continue;
      }
      // 토큰 하나가 한 줄보다 길다 — 글자 단위로 자른다
      for (const ch of [...token]) {
        if (line !== "" && measure(line + ch) > maxWidth) {
          out.push(line);
          line = "";
        }
        line += ch;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}
