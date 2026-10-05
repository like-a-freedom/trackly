#!/usr/bin/env python3
"""Download the documented OSM territory and rebuild versioned routing packs."""
import argparse
import pathlib
import subprocess
import tempfile
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--extract', type=pathlib.Path, help='Reuse an existing Overpass JSON extract')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='trackly-routing-') as temporary:
    extract = args.extract or pathlib.Path(temporary) / 'osm.json'
    if args.extract is None:
        query = '[out:json][timeout:180];way["highway"](55.95,37.30,56.48,38.03);out body geom;'
        request = urllib.request.Request('https://maps.mail.ru/osm/tools/overpass/api/interpreter', data=query.encode())
        with urllib.request.urlopen(request, timeout=240) as response:
            extract.write_bytes(response.read())
    subprocess.run(['cargo', 'run', '--locked', '--release', '--example', 'build_graph', '--', str(extract.resolve()), str(root / 'public/graphs')], cwd=root / 'wasm/fast_paths_wasm', check=True)
