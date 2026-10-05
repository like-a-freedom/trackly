# Trackly: реализация и приёмка UI/UX

Дата: 5 октября 2026. Основание: [план v2](2026-10-04-design-mitigation-plan.md), [аудит F01–F27](2026-10-04-ui-ux-audit.md). Исходная ревизия: `90b6f05b546fd3b9298148314331d18a9459ad5d`; первая реализация — `e4b7d34`.

Все 27 исходных дефектов получили реализацию и регрессионное покрытие. Ранее отсутствовавшие графы, live API-проверки, populated Account/Details и проверка исторического расстояния теперь выполнены. Полная физическая и пользовательская приёмка не подменяется автоматизацией: подтверждены открытие редактора Safari и автопрокладка в Дмитрове на iPhone пользователя; отдельного подтверждения клавиатуры, landscape, VoiceOver и жестов пока нет. Реальный Google consent/code exchange также не выполнен.

## Результат

Редактор организован вокруг карты и единственной панели «Маршрут / Описание / Проверка», с тремя размерами мобильной панели. Доступны координатное редактирование, Undo/Redo, POI, ручной режим, видимая территория дорожного графа. Метаданные вводятся один раз. Версионированный черновик сохраняет происхождение, геометрию, anchors, описание, POI, настройки и viewport; ошибки storage и конфликт вкладок видимы. Save привязан к редакции, идемпотентному request ID и окончательному server readback; частичный результат не уничтожает работу.

Главная карта, импорт, Details, Account и редактор используют общие semantic tokens, четыре primitives кнопок/полей, один TrackCategoryPicker и шесть категорий. У категорий одинаковые frontend/backend ограничения; custom значения сохраняются. Details не вычисляет расстояние по упрощённой отображаемой линии. Графики имеют доступные имена и клавиатурное чтение точек. Popovers/dialogs имеют focus, Escape и возврат фокуса; мобильные действия доступны без hover.

Live проверки обнаружили и устранили ошибки API-контрактов Account, повторного refresh, cookie path, nickname, bulk visibility/delete, повторного импорта и независимости POI у копий. Неудачный logout оставляет явный повтор; signed-out экран не выдаётся за пустую коллекцию. Параллельное обновление токена объединяется; поздний refresh/profile не восстанавливает завершённую сессию.

## Прослеживаемость

В таблице «закрыто» относится к исходному дефекту, а не к доказательству любого будущего сценария приложения.

| ID | Закрыто реализацией и проверкой |
|---|---|
| F01 | Responsive сетка, три sheet состояния; 320/390/1280 px, mobile Chromium/WebKit; Safari открывается на физическом iPhone |
| F02 | Mobile tools, Undo/Redo/POI, координатное редактирование; component/facade и browser проверки |
| F03 | More в portal, Escape/return focus; TopBar и browser visibility/hit checks |
| F04 | Deck удалён, одна scrollable панель; overflow assertions и screenshots |
| F05 | Одна metadata форма; DOM count и view tests |
| F06 | Draft schema/origin/flush/timer/conflicts/storage recovery; unit и live LAN reload/Restore |
| F07 | Revision guards, partial failure/readback, идемпотентное создание; live save и DB concurrent create/replay |
| F08 | Back/dirty status/leave guard; browser cancel/leave/reload |
| F09 | Реальные шесть graph/node packs, WASM URL на LAN, loading/profile/coverage/manual fallback; реальные дороги Правдинского и Дмитрова, подтверждение iPhone |
| F10 | Task IA, progressive disclosure, Route/Description/Review; live workspace и независимый визуальный review |
| F11 | Labels/roles/chart names/readout; WCAG A/AA axe на Home/editor/callback/populated Details/Account |
| F12 | Modal focus trap, Escape, inert и return focus; component/browser, включая Account nickname |
| F13 | Canonical distance плюс независимый исходный KML: ошибка Point Placemark устранена, конкретная историческая запись исправлена и readback совпадает |
| F14 | Общие 13 semantic colors и ui-field/ui-primary/ui-secondary/ui-danger; миграция изменённых controls, DESIGN/sidecar и визуальный review |
| F15 | Подписанные Create/Import и доступные действия; browser checks |
| F16 | Statistics перед Description, recorded/estimated/absent, responsive populated Details, доступные charts; live screenshots/axe/geometry checks |
| F17 | Keyboard file input/labels; реальный GPX/KML upload с source-preservation assertions |
| F18 | Upload locking/stale guard/permalink; live duplicate link, private track protection и повторный import |
| F19 | Общий TrackCategoryPicker, taxonomy/custom/readonly/pending/error и cross-layer validation; component/API tests |
| F20 | Flags fail closed/retry, singleflight initialization/refresh, cookie /api/auth, реальные profile/nickname/logout retry/delete-account; signed-out отдельно от empty |
| F21 | Search modal plane/inert/trap/Escape; red→green regression и browser checks |
| F22 | Semantic muted/action/focus и контраст attribution; axe на проверенных populated/public состояниях |
| F23 | Staged POI/Undo, transactional links/distances, независимые snapshots; live UI→HTTP→DB save/readback/copy |
| F24 | Dirty guards, truthful export/copy result; настоящий download всех трёх форматов и copy readback |
| F25 | Filtered selection, immutable IDs, только подтверждённые bulk результаты; live populated search/visibility/delete |
| F26 | Full geometry/editor DTO/anchors/metadata; live owner edit/save/reload и DB preservation |
| F27 | Исправление tooltip сохранено; keyboard/focus и mobile tools проверены, физическая touch-help приёмка отдельно |

## Графы и измерения

Графы покрывают Дмитров–Правдинский: latitude 55.95–56.48, longitude 37.30–38.03. Источник OpenStreetMap, Overpass; attribution и дата в manifest. Шесть профилей: hiking/walking/running/cycling/mtb/driving. Cache version — SHA256 graph+nodes. Вне территории интерфейс предлагает ручной режим. Это shortest-distance граф с access/oneway; turn restrictions и достоверное покрытие surface не моделируются. Локальные бинарные packs (~180 MB) исключены из Git, воспроизводятся `python3 scripts/prepare-routing.py`; Docker/CI подключают подготовку. Повторная подготовка из сохранённого extract успешно воспроизвела manifest. Docker image build и deployment не запускались.

Источник исторической ошибки: `tracks/kml/Смоленское поозерье - разведка.kml`, SHA256 `72ad2cf94271a0d18f101db3c30b1b4543af7c193f292740562044b0dbea009b`. 19 отдельных Point Placemark ошибочно добавлялись к маршруту. LineString содержит 1948 точек; независимая сферическая сумма — 128.44642078202975 км. Scoped repair проверил ID, hash и совпадение исходной геометрии, сохранил приватную резервную копию и исправил только известную запись. API list/detail/simplified возвращают 128.44642078202992 км. Это подтверждает закрытие F13; не является аудитом всех исторических записей БД. [Evidence JSON](2026-10-04-design-evidence/implementation/historical-distance-reference.json).

## Проверки

- Frontend: полный Vitest — 1806 passed, 12 skipped; production build с vue-tsc прошёл. Lint: 0 errors, 75 существующих warnings. Vite предупреждает о размере main chunk и смешанном Leaflet import.
- Backend: 276 passed, 13 ignored; cargo clippy all-targets с `-D warnings` и cargo fmt прошли. Отдельный ignored editor_integrity против PostgreSQL: 1 passed, включая concurrent create, replay, POI isolation, duplicate и сохранение записанных координат/времени.
- Live Playwright: **27 passed** на production frontend и реальном backend, desktop Chromium/mobile Chromium/mobile WebKit. Реальные disposable accounts создаются штатным backend factory; refresh/profile/nickname/bulk/logout/delete проверяются через HTTP. Google OAuth provider не эмулируется как пройденный consent.
- Responsive fixture suite: **8 passed**, 320×568/390×844/1280×800; fixtures проверяют layout/error/recovery, а не подменяют live roundtrip.
- [Screenshots/evidence](2026-10-04-design-evidence/implementation/) включают реальные populated editor/Details/Account. [Финальный независимый Impeccable verdict](../../.impeccable/review/2026-10-05-final-live-verdict.md): ship в проверенном scope; найденный desktop overflow Details исправлен и подтверждён.
- Тестовые аккаунты/треки очищаются; секреты/refresh tokens/traces не включаются в репозиторий.

## Остаточные ворота приёмки

Техническая реализация F01–F27 выполнена. Остаются фактические проверки, которые требуют внешнего действия: физические Safari keyboard/landscape/VoiceOver/gesture cancellation; реальный Google sign-in на HTTPS; пользовательская проверка обнаружимости и сложных задач. Performance benchmark и production deployment не выполнены и не заявляются. Полный legacy E2E suite не запускался; результаты относятся к указанным наборам.

Локальный Vite proxy использует явный IPv4 upstream 127.0.0.1:8080, устраняя неоднозначный localhost при совместном Docker/native runtime.

Локальная сборка оставлена доступной: http://192.168.20.28:81/ . Для выпуска применить SQLx migrations, включая `20261005000000_fix_deleted_poi_audit.sql` и `20261005000001_isolate_editor_poi_snapshots.sql`, пересобрать frontend/WASM/backend и обеспечить HTTPS для OAuth. Пользователь уже подтвердил Safari Create route и автопрокладку в Дмитрове.
