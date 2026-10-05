#!/usr/bin/env python3
"""Download the documented OSM territory and rebuild versioned routing packs."""
import argparse
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

BBOX = '55.95,37.30,56.48,38.03'
QUERY = f'[out:json][timeout:180];way["highway"]({BBOX});out body geom;'

# Public Overpass API mirrors, tried in order. The first entry is the primary
# source documented in public/graphs/README.md; the rest are fallbacks so a
# single overloaded mirror (e.g. an HTTP 504) cannot fail a build.
ENDPOINTS = (
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
)
ATTEMPTS_PER_ENDPOINT = 3
BACKOFF_SECONDS = 5
USER_AGENT = 'trackly-routing-builder/1.0'


def download_extract(timeout: float) -> bytes:
    """Fetch the Overpass extract, retrying mirrors with backoff on failure."""
    override = os.environ.get('OVERPASS_URL')
    endpoints = (override,) if override else ENDPOINTS
    last_error: Exception | None = None
    for endpoint in endpoints:
        for attempt in range(1, ATTEMPTS_PER_ENDPOINT + 1):
            try:
                request = urllib.request.Request(
                    endpoint,
                    data=QUERY.encode(),
                    headers={'User-Agent': USER_AGENT},
                )
                with urllib.request.urlopen(request, timeout=timeout) as response:
                    payload = response.read()
                extract = json.loads(payload)
                if 'remark' in extract or not extract.get('elements'):
                    raise ValueError(
                        f'incomplete extract: {extract.get("remark", "no elements")}'
                    )
                return payload
            except (urllib.error.URLError, OSError, ValueError) as error:
                last_error = error
                if attempt < ATTEMPTS_PER_ENDPOINT:
                    delay = BACKOFF_SECONDS * attempt
                    print(
                        f'{endpoint} attempt {attempt} failed ({error}); '
                        f'retrying in {delay}s',
                        file=sys.stderr,
                    )
                    time.sleep(delay)
                else:
                    print(
                        f'{endpoint} failed after {ATTEMPTS_PER_ENDPOINT} '
                        f'attempts ({error})',
                        file=sys.stderr,
                    )
    raise SystemExit(f'could not download Overpass extract from any mirror: {last_error}')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--extract', type=pathlib.Path, help='Reuse an existing Overpass JSON extract')
    parser.add_argument(
        '--timeout',
        type=float,
        default=float(os.environ.get('OVERPASS_TIMEOUT', '240')),
        help='Per-request timeout in seconds',
    )
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix='trackly-routing-') as temporary:
        extract = args.extract or pathlib.Path(temporary) / 'osm.json'
        if args.extract is None:
            extract.write_bytes(download_extract(args.timeout))
        subprocess.run(
            [
                'cargo', 'run', '--locked', '--release', '--example', 'build_graph', '--',
                str(extract.resolve()), str(root / 'public/graphs'),
            ],
            cwd=root / 'wasm/fast_paths_wasm',
            check=True,
        )


if __name__ == '__main__':
    main()
