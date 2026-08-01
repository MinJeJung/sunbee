import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { assertTocTargets } from "./toc-gate";

const execFileAsync = promisify(execFile);
const directories: string[] = [];

async function epubWithoutBodyToc() {
  const directory = await mkdtemp(path.join(tmpdir(), "toc-gate-"));
  directories.push(directory);
  const epubPath = path.join(directory, "book.epub");
  const script = `
import sys, zipfile
target = sys.argv[1]
files = {
  "mimetype": "application/epub+zip",
  "META-INF/container.xml": """<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>""",
  "EPUB/package.opf": """<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>""",
  "EPUB/nav.xhtml": """<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="text/chapter.xhtml#s1">1-1. 시작</a></li></ol></nav></body></html>""",
  "EPUB/text/chapter.xhtml": """<html xmlns="http://www.w3.org/1999/xhtml"><body><h2 id="s1">1-1. 시작</h2><p>본문</p></body></html>""",
}
with zipfile.ZipFile(target, "w") as z:
  z.writestr("mimetype", files.pop("mimetype"), compress_type=zipfile.ZIP_STORED)
  for name, content in files.items():
    z.writestr(name, content)
`;
  const scriptPath = path.join(directory, "fixture.py");
  await writeFile(scriptPath, script, "utf8");
  await execFileAsync("/usr/bin/python3", [scriptPath, epubPath]);
  expect((await readFile(epubPath)).length).toBeGreaterThan(0);
  return epubPath;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("assertTocTargets", () => {
  it("accepts a valid viewer TOC when a separate body TOC page is absent", async () => {
    await expect(assertTocTargets(await epubWithoutBodyToc())).resolves.toBeUndefined();
  });

  it("can still enforce a body TOC for callers that explicitly require it", async () => {
    await expect(assertTocTargets(await epubWithoutBodyToc(), { requireBodyToc: true }))
      .rejects.toThrow("본문 차례 페이지가 없음");
  });
});
