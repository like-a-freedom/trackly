# Trackly: реализация плана UI/UX

Дата: 5 октября 2026. Основание: [план v2](2026-10-04-design-mitigation-plan.md), [аудит F01–F27](2026-10-04-ui-ux-audit.md). Исходная ревизия: `90b6f05b546fd3b9298148314331d18a9459ad5d`.

Код реализации и регрессионные проверки подготовлены. Это не сертификат полной приёмки всех сценариев: отсутствующие routing assets, физические устройства, исходные данные исторических измерений и полноценная авторизованная среда остаются отдельными воротами приёмки. Ниже неизвестное не считается пройденным.

## Что изменилось

- Редактор построен вокруг карты и одной панели «Маршрут / Описание / Проверка». Повторные формы и bottom deck удалены из рабочего экрана. На телефоне панель имеет три управляемых состояния; карта, режимы, Undo/Redo и POI остаются доступны. Добавлен ввод и изменение точек по координатам без зависимости от drag/hover.
- Сохранение привязано к конкретной редакции, защищено от повторных запросов, проверяет HTTP-результаты и окончательный server readback. Частичный или неопределённый результат не очищает работу. Стабильный request ID позволяет восстановить результат создания после потерянного ответа.
- Полный версионированный черновик хранит происхождение, геометрию, anchors, метаданные, POI, настройки и viewport. Таймер отменяется при удалении; последние изменения сбрасываются при уходе. Конфликт вкладок и недоступность storage видимы. Выход из редактора требует осознанного решения при несохранённой работе.
- POI теперь редактируются вместе с маршрутом и Undo; backend транзакционно сохраняет связи и расстояния. Дублирование сохраняет segment metadata, POI links и записанные данные. Изменение геометрии GPS-записи создаёт производный маршрут; правка описания не переписывает исходную запись.
- Полный editor DTO и sparse anchors загружаются согласованно. List/detail/editor используют сохранённое каноническое расстояние, пока геометрия не изменена; отображаемая упрощённая линия больше не определяет расстояние details.
- Главная карта получила подписанные Create/Import, импорт — доступный выбор файла, постоянные labels, pending state и устойчивую ссылку результата. Коллекция различает ошибку и пустой список, объясняет область поиска и выбирает только показанные результаты; bulk запрос фиксирует набор IDs.
- Общие токены, focus и reduced-motion правила документированы в [DESIGN.md](../../DESIGN.md). Категории имеют общий справочник. Dialog/search/nickname обеспечивают клавиатурный фокус и изоляцию фона. Графики имеют доступные имена и текстовое чтение выбранной точки.
- WASM собирается в правильный public каталог; Docker и CI включают сборку из исходников. Графы дорог этим не создаются.

## Прослеживаемость F01–F27

«Исправлено» означает исправление исходного дефекта с указанной проверкой. Дополнительные условия полной приёмки явно отмечены; таблица не утверждает проверку каждого состояния приложения.

| ID | Реализация и доказательство | Оставшееся условие |
|---|---|---|
| F01 | Новая responsive сетка, три состояния sheet; Playwright 320×568, 390×844, 1280×800 | Физический Safari, landscape и экранная клавиатура |
| F02 | Доступные mobile tools, Undo/Redo/POI, координатное редактирование; view/map/facade tests | Touch/gesture cancellation на устройстве |
| F03 | More вынесен в portal, Escape и возврат фокуса; TopBar tests и browser hit/visibility checks | Полная матрица всех contextual popovers |
| F04 | Deck удалён, единственная scrollable панель; screenshots и overflow assertions | Длинные реальные тексты и все локали |
| F05 | Единственная metadata форма; browser count=1, view tests | Полный автоматический DOM audit всех состояний |
| F06 | Draft schema/origin/flush/timer/conflicts/storage recovery; useDraftSave/useTrackEditor tests, browser reload | Реальные параллельные вкладки и browser storage eviction |
| F07 | Revision guard, single flight, partial failure и final readback; persistence tests | Live HTTP save/retry против обновлённого backend |
| F08 | Back, dirty-aware status, leave guard; browser cancel/leave/reload | Физическое закрытие вкладки и системный beforeunload |
| F09 | Исправлена доставка WASM, manual fallback, profile/Snap и сохранение viewport | **Real auto ready не принят: отсутствуют `/graphs/default_<activity>_v1.bin` и nodes** |
| F10 | Task IA и progressive disclosure реализованы | Проверка сложных задач новичком и опытным пользователем |
| F11 | Labels/roles в изменённых controls, chart keyboard readout; component tests | Полный screen-reader/axe проход populated states |
| F12 | Modal semantics, focus trap, Escape, return focus, inert background; component/browser tests | VoiceOver и nested modal сценарии |
| F13 | Canonical stored distance в detail/editor, геометрия изменяет расчёт; backend/facade regression | **Историческая корректность DB distance по исходному файлу не установлена** |
| F14 | Общие tokens, system typography, focus, layer contract, DESIGN и sidecar | Legacy components имеют локальные CSS; полная миграция каждого control не заявлена |
| F15 | Подписанные Create/Import; browser checks | Проверка обнаружимости на пользователях |
| F16 | Statistics перед Description, recorded/estimated/absent semantics, responsive details, резервирование карты под панель | Populated recording со всеми series на устройстве |
| F17 | Keyboard file input и labels; UploadForm tests и browser import checks | Реальный upload corpus GPX/KML против работающего HTTP backend |
| F18 | Upload locking, stale-response guard, устойчивый permalink; UploadForm tests | Live duplicate/import/server-failure сценарии |
| F19 | Общая taxonomy из шести категорий, custom значения сохранены; component tests | Контроль имеет разные legacy представления; единый visual primitive и общая cross-layer validation остаются отдельной работой |
| F20 | Guards ждут flags, single pending fetch, Account error/retry/empty; store/browser tests | Real OAuth/callback/logout/delete-account; при ошибке flags сохранён прежний defaults contract |
| F21 | Search modal plane поднят, фон inert, прежние trap/Escape сохранены; новый red→green regression | Screen reader и populated search browser flow |
| F22 | Count использует более тёмный semantic text, общий focus contract | Полный effective-color contrast audit всех ролей/состояний не выполнен |
| F23 | Staged POI + Undo + transactional links/distances/readback; facade/persistence tests и PostgreSQL integration | Live UI→HTTP→DB roundtrip на обновлённом runtime |
| F24 | Truthful export boolean, dirty guards во View, duplicate metadata/POI links; unit/DB tests | Проверка каждого формата и scope файла через настоящий UI; public facade guards не универсальны |
| F25 | Filtered selection, immutable request scope, error/retry; bulk tests и Account browser fixture | Populated live collection, pagination/destructive flows |
| F26 | Flat/Feature DTO adapter, full geometry, anchors и metadata; persistence/geometry/DB tests | Live owner edit/save/reload через обновлённый HTTP runtime |
| F27 | Сохранено внешнее исправление tooltip, baseline focus evidence остаётся валидным | Touch help на устройстве; новое полное подтверждение не заявлено |

## Проверки и доказательства

- Frontend: `bun run test` — 1790 passed, 12 skipped; `bun run build` (включает `vue-tsc --noEmit`) прошёл; `bun run lint` — 0 errors, 75 warnings. После последнего переноса Details отдельные 27 TrackView tests прошли; production build повторён успешно.
- Backend: полный `cargo test` — 273 passed, 13 ignored; `cargo clippy --all-targets -- -D warnings` и `cargo fmt --check` прошли.
- Отдельный ignored `editor_integrity` запущен против локального PostgreSQL: 1 passed. Создание/replay, anchors, POI distances, duplicate и сохранение EWKB записи проверяются на уникальных тестовых объектах с очисткой. SQLx migrations применяются штатно.
- Новый Playwright config: **8 passed** на окончательной production сборке. Он не запускает серверы: использует `dist` через interception, явно синтетические fixtures и 503 для недоступного elevation. Проверяет UI/recovery и expanded/collapsed Details map widths, а не live end-to-end сохранение. Старый полный E2E suite не запускался: его конфигурация поднимает серверы, что запрещено инструкциями проекта.
- [Screenshots](2026-10-04-design-evidence/implementation/) содержат desktop/mobile editor, Home/Import, Details и Account. OSM tiles могут быть неполными; это не доказательство дефекта карты. Empty/fixture capture не доказывает все populated states.
- Независимое code review последних изменений не обнаружило существенных блокеров для commit. [Impeccable verdict](../../.impeccable/review/2026-10-05-finish-verdict.md) закрыл три конкретных визуальных замечания: clipping Import, clipping Close в Details и лишний eyebrow редактора. Его `ship` ограничен этим scope, а не всей матрицей приёмки.
- Detector запускался один раз; пять находок исправлены. Повторный detector score и новая итоговая UX оценка не выдумываются.

## Выпуск и незакрытые зависимости

Новая SQLx migration `20261005000000_fix_deleted_poi_audit.sql` устраняет FK сбой audit при удалении POI, сохраняя OLD snapshot с nullable poi_id. При выпуске нужно применить migrations и пересобрать frontend/WASM/backend. Docker image и production deployment в этой задаче не выполнялись.

Порты 81/8080 перестали отвечать к финальному browser проходу; серверы не запускались и не перезапускались. Ранее DB integration и backend checks выполнены успешно. Текущий UI harness корректно представляет недоступный API как ошибку, не как успешную операцию.

Для полной приёмки требуются graph/node assets с известной территорией и профилями; оригинальные файлы для проверки исторической distance; работающая тестовая auth/API среда; физический mobile/VoiceOver проход. Performance benchmark не проводился. Vite сохраняет предупреждения о крупном основном chunk и Leaflet dynamic import. Concurrent request-ID create race между независимыми writers не доказан устранённым транзакционным контрактом; single-flight клиента не заменяет server concurrency proof.
