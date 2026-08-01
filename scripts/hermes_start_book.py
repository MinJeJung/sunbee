#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_URL = "http://127.0.0.1:3000"
KEYCHAIN_SERVICE = "com.sunbeebooks.sol-ebook-dashboard.bridge"
STARTED_STATUSES = {"insight_processing", "building", "awaiting_review"}


def parse_numbers(value: str) -> list[int]:
    normalized = re.sub(r"[^0-9,]+", ",", value)
    numbers = [int(item) for item in normalized.split(",") if item]
    if not numbers or any(number < 1 for number in numbers):
        raise ValueError("승인 번호는 1 이상의 숫자여야 합니다.")
    return list(dict.fromkeys(numbers))


def load_selected_topics(path: Path, approved: str) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("주제 파일은 JSON 배열이어야 합니다.")
    numbers = list(range(1, len(data) + 1)) if approved.strip() == "전체" else parse_numbers(approved)
    if any(number > len(data) for number in numbers):
        raise ValueError(f"승인 번호는 1~{len(data)} 범위여야 합니다.")
    return [{**data[number - 1], "_number": number} for number in numbers]


def token() -> str:
    configured = (os.environ.get("CODEX_BRIDGE_TOKEN") or "").strip()
    if configured:
        return configured
    result = subprocess.run(
        ["/usr/bin/security", "find-generic-password", "-a", os.environ.get("USER", "minje"), "-s", KEYCHAIN_SERVICE, "-w"],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def api_json(base_url: str, path: str, api_token: str, *, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method="GET" if payload is None else "POST",
        headers={"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"대시보드 API 오류 {error.code}: {detail[:500]}") from error


def request_id(prefix: str, direction: str, number: int | None) -> str:
    digest = hashlib.sha256(direction.encode("utf-8")).hexdigest()[:16]
    suffix = str(number) if number is not None else digest
    return f"{prefix}:{suffix}:{digest}"[:160]


def submit(base_url: str, api_token: str, direction: str, resources: list[str], external_id: str) -> dict[str, Any]:
    return api_json(base_url, "/api/topics/create", api_token, payload={
        "direction": direction,
        "resources": resources,
        "requestId": external_id,
    })


def wait_for_start(base_url: str, api_token: str, operation_ids: list[str], wait_seconds: int) -> dict[str, str]:
    deadline = time.monotonic() + wait_seconds
    statuses: dict[str, str] = {}
    while True:
        for operation_id in operation_ids:
            body = api_json(base_url, f"/api/topics/{operation_id}", api_token)
            status = str(body["operation"]["status"])
            statuses[operation_id] = status
            if status == "failed":
                error = body["operation"].get("error", "알 수 없는 오류")
                raise RuntimeError(f"제작 시작 실패 ({operation_id}): {error}")
        if any(status in STARTED_STATUSES for status in statuses.values()) or time.monotonic() >= deadline:
            return statuses
        time.sleep(1)


def main() -> int:
    parser = argparse.ArgumentParser(description="Hermes에서 선비북스 전자책 제작을 시작합니다.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--direction", help="직접 승인한 책 주제")
    source.add_argument("--direction-file", type=Path, help="직접 승인한 책 주제 텍스트 파일")
    source.add_argument("--topics-file", type=Path, help="일별 추천 JSON 파일")
    parser.add_argument("--approve", default="전체", help="승인 번호 목록 또는 전체")
    parser.add_argument("--resource", action="append", default=[], help="참고 URL, 반복 가능")
    parser.add_argument("--request-prefix", default="hermes-direct", help="멱등 요청 ID 접두사")
    parser.add_argument("--base-url", default=DEFAULT_URL)
    parser.add_argument("--wait-seconds", type=int, default=20)
    args = parser.parse_args()

    entries: list[tuple[str, list[str], int | None]] = []
    if args.direction or args.direction_file:
        direction = args.direction if args.direction else args.direction_file.read_text(encoding="utf-8")
        entries.append((direction.strip(), list(args.resource), None))
    else:
        for topic in load_selected_topics(args.topics_file, args.approve):
            title = str(topic.get("title", "")).strip()
            detail = str(topic.get("detail_topic", "")).strip()
            if not title or not detail:
                raise ValueError("선택 주제에 title 또는 detail_topic이 없습니다.")
            resources = [str(url) for url in topic.get("evidence_urls", []) if isinstance(url, str)]
            entries.append((f"{title} — {detail}", resources, int(topic["_number"])))

    api_token = token()
    results = []
    for direction, resources, number in entries:
        external_id = request_id(args.request_prefix, direction, number)
        results.append(submit(args.base_url, api_token, direction, resources, external_id))
    operation_ids = [str(result["operationId"]) for result in results]
    statuses = wait_for_start(args.base_url, api_token, operation_ids, max(0, args.wait_seconds))
    output = {
        "status": "accepted",
        "count": len(results),
        "operations": [
            {
                "operationId": result["operationId"],
                "created": result["status"] == "created",
                "productionStatus": statuses.get(str(result["operationId"]), result.get("operationStatus")),
            }
            for result in results
        ],
    }
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from error
