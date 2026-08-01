"use client";

import { ArrowUp, ImageSquare, Paperclip, PencilSimpleLine, X } from "@phosphor-icons/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent } from "react";
import { requestRevisionAction } from "@/app/actions";
import {
  initialRevisionActionState,
  MAX_REVISION_IMAGES,
  parseRevisionImageFiles,
  RevisionFeedbackError,
} from "@/lib/revision-feedback";
import styles from "./revision-request-form.module.css";

type Preview = {
  readonly id: string;
  readonly file: File;
  readonly url: string;
};

export function RevisionRequestForm({ operationId, title }: { readonly operationId: string; readonly title: string }) {
  const [state, formAction, pending] = useActionState(requestRevisionAction, initialRevisionActionState);
  const [previews, setPreviews] = useState<readonly Preview[]>([]);
  const [notes, setNotes] = useState("");
  const [clientError, setClientError] = useState("");
  const [dragging, setDragging] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews]);
  useEffect(() => {
    if (state.status !== "sent") return;
    detailsRef.current?.removeAttribute("open");
    router.refresh();
  }, [router, state.status]);

  function updatePreviews(files: readonly File[]) {
    setPreviews(files.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) })));
  }

  function syncFiles(files: readonly File[]) {
    try {
      const parsed = parseRevisionImageFiles(files);
      const transfer = new DataTransfer();
      parsed.forEach((file) => transfer.items.add(file));
      if (inputRef.current) inputRef.current.files = transfer.files;
      setClientError("");
      updatePreviews(parsed);
    } catch (error) {
      if (error instanceof RevisionFeedbackError) {
        setClientError(error.message);
        return;
      }
      throw error;
    }
  }

  function appendFiles(files: readonly File[]) {
    syncFiles([...previews.map((preview) => preview.file), ...files]);
  }

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    appendFiles(Array.from(files));
  }

  function handlePaste(event: ClipboardEvent<HTMLFormElement>) {
    const images = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (images.length === 0) return;
    event.preventDefault();
    appendFiles(images);
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragging(false);
    const images = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    if (images.length > 0) appendFiles(images);
  }

  function handleDragLeave(event: DragEvent<HTMLFormElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setDragging(false);
  }

  function removePreview(id: string) {
    const remaining = previews.filter((preview) => preview.id !== id);
    syncFiles(remaining.map((preview) => preview.file));
  }

  const message = clientError || (state.status === "error" ? state.message : "");
  const trayState = pending ? "pending" : clientError ? "error" : previews.length > 0 ? "selected" : "empty";

  return <details className={styles.root} ref={detailsRef}>
    <summary className={styles.trigger}><PencilSimpleLine size={17} /> 수정 요청</summary>
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.codexMark}><ImageSquare size={20} /></span>
        <div><strong>Codex에 수정 요청</strong><p>{title}의 완성본과 첨부 이미지를 함께 전달합니다.</p></div>
        <button aria-label="수정 요청 닫기" className={styles.closeButton} onClick={() => detailsRef.current?.removeAttribute("open")} type="button"><X size={18} /></button>
      </div>
      <form
        action={formAction}
        className={`${styles.form} ${dragging ? styles.dragging : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={handleDragLeave}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        <input name="operationId" type="hidden" value={operationId} />
        <label className={styles.label} htmlFor={`revision-${operationId}`}>무엇을 어떻게 바꿀까요?</label>
        <textarea
          autoFocus
          className={styles.textarea}
          id={`revision-${operationId}`}
          maxLength={5000}
          name="notes"
          onChange={(event) => setNotes(event.target.value)}
          placeholder="예: 첨부 이미지에서 표시한 목차 링크 위치를 바로잡고, 표지 제목의 줄바꿈을 이미지와 동일하게 수정해줘. 수정 후 EPUB 링크와 표지를 다시 검수해줘."
          required
          value={notes}
        />
        <div aria-label="첨부 이미지" aria-live="polite" className={styles.attachmentTray} data-state={trayState}>
          {previews.length > 0 ? <div className={styles.previewGrid} aria-label="첨부 이미지 미리보기">
            {previews.map((preview) => <article className={styles.preview} key={preview.id}>
              <Image alt={`${preview.file.name} 미리보기`} height={108} src={preview.url} unoptimized width={108} />
              <span title={preview.file.name}>{preview.file.name}</span>
              <button aria-label={`${preview.file.name} 삭제`} onClick={() => removePreview(preview.id)} type="button"><X size={17} /></button>
            </article>)}
          </div> : <p className={styles.emptyTray}>{pending ? "수정 요청을 안전하게 전송하고 있습니다." : "캡처 이미지를 입력창에 ⌘V로 붙여넣거나 아래 버튼에서 선택하세요."}</p>}
          {pending && previews.length > 0 ? <p className={styles.trayStatus}>첨부 이미지를 안전하게 전송하고 있습니다.</p> : null}
        </div>
        <div className={styles.toolbar}>
          <div className={styles.attachmentTools}>
            <input
              accept="image/jpeg,image/png,image/webp"
              className={styles.fileInput}
              multiple
              name="images"
              onChange={(event) => handleFiles(event.target.files)}
              ref={inputRef}
              tabIndex={-1}
              type="file"
            />
            <button aria-label="수정 참고 이미지 첨부" className={styles.attachButton} disabled={pending || previews.length >= MAX_REVISION_IMAGES} onClick={() => inputRef.current?.click()} type="button"><Paperclip size={18} /> 이미지 첨부</button>
            <small>⌘V 붙여넣기 · JPG·PNG·WebP · 최대 {MAX_REVISION_IMAGES}장 · 장당 5MB/전체 15MB</small>
          </div>
          <div className={styles.sendTools}><span>{notes.length.toLocaleString("ko-KR")}/5,000</span><button aria-label="수정 요청 보내기" className={styles.sendButton} disabled={pending || notes.trim().length < 5} type="submit"><ArrowUp size={18} /> {pending ? "전달 중" : "Codex에 보내기"}</button></div>
        </div>
        {message ? <p className={styles.error} role="alert">{message}</p> : null}
        {state.status === "sent" ? <p className={styles.success} role="status">{state.message}</p> : null}
      </form>
    </div>
  </details>;
}
