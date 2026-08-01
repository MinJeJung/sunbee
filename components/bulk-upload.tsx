"use client";

import { DownloadSimple, FileArrowUp, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import readXlsxFile from "read-excel-file";
import { createBulkTopicsAction } from "@/app/request-actions";
import { parseBulkRows, type BulkParseResult } from "@/lib/bulk-intake";
import { matrixToRecords, parseCsvText } from "@/lib/bulk-file";

const TEMPLATE = "예상독자,논문/유튜브 링크1,논문/유튜브 링크2,책 제작 방향성,추천 목차 구성\n마케터,https://arxiv.org/abs/2505.16120,,AI 에이전트로 마케팅 반복 업무를 자동화한다,1장 문제 정의 | 2장 워크플로우 설계";

export function BulkUpload() {
  const [result, setResult] = useState<BulkParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  const readFile = async (file: File) => {
    setError("");
    if (file.size > 5 * 1024 * 1024) {
      setError("5MB 이하 파일만 사용할 수 있습니다.");
      return;
    }
    const extension = file.name.split(".").at(-1)?.toLowerCase();
    try {
      const matrix = extension === "xlsx" ? await readXlsxFile(file) : parseCsvText(await file.text());
      const parsed = parseBulkRows(matrixToRecords(matrix));
      if (parsed.rows.length === 0) setError("데이터 행을 찾지 못했습니다.");
      setFileName(file.name);
      setResult(parsed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "파일을 읽지 못했습니다.");
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([`\uFEFF${TEMPLATE}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "선비북스_대량작업_템플릿.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return <section className="bulk-workspace">
    <div className="bulk-dropzone">
      <FileArrowUp size={30} />
      <div><strong>CSV 또는 XLSX 파일 선택</strong><span>최대 100권 · 5MB 이하</span></div>
      <label className="button primary">파일 선택<input accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); }} type="file" /></label>
      <button className="button secondary" onClick={downloadTemplate} type="button"><DownloadSimple size={17} /> CSV 양식</button>
    </div>
    {error ? <p className="bulk-error"><WarningCircle size={17} />{error}</p> : null}
    {result ? <form action={createBulkTopicsAction}>
      <input name="rows" type="hidden" value={JSON.stringify(result.rows)} />
      <div className="bulk-summary"><strong>{fileName}</strong><span>등록 가능 {result.validCount}권 · 확인 필요 {result.invalidCount}권</span></div>
      <div className="table-wrap"><table className="bulk-table"><thead><tr><th>행</th><th>예상 독자</th><th>책 제작 방향</th><th>자료</th><th>검증</th></tr></thead><tbody>{result.rows.map((row) => <tr className={row.errors.length ? "invalid" : ""} key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.targetReader || "미입력"}</td><td><strong>{row.problem || "미입력"}</strong><small>{row.desiredOutcome}</small></td><td>{row.resources.length}개</td><td>{row.errors.length ? row.errors.join(" ") : "등록 가능"}</td></tr>)}</tbody></table></div>
      <div className="bulk-actions"><p>오류 행은 제외하고, 정상 행의 기획안만 생성합니다.</p><button className="button primary" disabled={result.validCount === 0} type="submit">{result.validCount}권 기획안 생성</button></div>
    </form> : null}
  </section>;
}
