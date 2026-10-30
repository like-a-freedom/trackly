# Uploaded tracks missing from the home map

## Reproduction and cause

The reported viewport at zoom 7 returned seven tracks from the real local API.
Adding the UI-generated slope_min=0&slope_max=20 returned zero: every enriched
route contained descents, and unenriched routes had NULL slope values. Automatic
length/elevation bounds also excluded long routes or missing enrichment.
Legacy localStorage persisted these automatic slider bounds as user choices.
The client additionally interpreted an empty category selection as no matches,
while the API interpreted it as unrestricted.

After eliminating those unintended restrictions, a second failure remained:
TrackMap initialized its cluster adapter but never assigned the resulting group
to useTrackClustering.clusterGroup. The update callback therefore returned early.

## Fix

Numeric sliders now carry explicit activation metadata. Only user changes activate
numeric restrictions; legacy automatic bounds remain visible slider values but
are not applied. Explicit new choices persist and Reset clears activation.
HomeView omits inactive ranges for both tracks and heatmaps; client filtering
honors the same flags. Empty categories mean unrestricted. The cluster update
code receives the group created by the adapter.

## Verification

The actual reported local URL renders seven visible cluster markers after reload.
Regression coverage checks legacy storage, unrestricted long/descending and
unenriched routes, category semantics, user activation, persistence, Reset,
cluster rendering, reload, and zooming into line rendering. Browser checks run
against both WebKit and Chromium. No track data or database settings were changed.
