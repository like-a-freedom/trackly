# Trackly: полный аудит текущего UI/UX

Метод: две независимые проверки Impeccable — A: `/root/design_review`, B: `/root/technical_evidence`. Дизайн-оценка A завершена до передачи результатов детектора в общий синтез; дополнительно выполнены собственное чтение кода, просмотр снимков, GET-проверка метрик и три существующих Playwright теста.

Дата: 4 октября 2026. Версия 2 после повторной проверки плана и контрактов. Режим: **Operate** — человек работает с геометрией и данными. Первые screenshots/axe описывают исходное рабочее дерево с локальными изменениями `TrackDetailPanel.vue`; при перепроверке также изменился `StatisticsPanel.vue` внешней работой. Новые наблюдения и их актуальность указаны отдельно. Исполнители аудита исходники приложения не меняли.

## 1. Вердикт

**Целостность реализации: не пройдена.** Интерфейс редактора теряет возможности, перекрывает рабочие controls, обрезает формы и ненадёжно восстанавливает данные. Визуальная система фрагментирована между картой, редактором, деталями и кабинетом. Это требует новой информационной архитектуры редактора и общей системы компонентов.

Главная причина перегрузки — организация экрана по инженерным модулям: toolbar, inspector, metadata, segments, actions, optimizer, chart. Человек должен понимать задачу и следующий шаг, а сейчас выбирает между несколькими местами для одних и тех же данных. В текущем состоянии не стоит признавать интерфейс готовым к выпуску.

При этом основа продукта сильная: настоящая карта и геометрия, прямое редактирование, сегменты, маршрутизация, высота, POI, undo/redo и экспорт. Сохранять нужно эти способности. Текущие карточки, четыре зоны и overlay-only требования не ограничивают новое решение: пользователь явно попросил проектировать из первых принципов.

Реестр версии 2 содержит **27 групп: 1 P0, 20 P1, 6 P2; P3 не включены**. F01–F22 получены в первом проходе; F23–F26 добавлены при перепроверке контрактов, F27 отслеживает новый tooltip и внешнее исправление его исходника. Это группы действий/проверок, а не сумма warnings, число открытых уникальных багов или доказательство регрессий относительно старой версии. Историческое сравнение с состоянием до рефакторинга не проводилось.

## 2. Оценки и границы

### UX: 17/40 — требуется существенная пересборка

Баллы — экспертная оценка первого визуального прохода с приоритетом создания/редактирования; это не метрика реальных пользователей. При проверке версии 2 UX заново не пересчитывался: контрактные находки усиливают план, не создают фиктивный новый рейтинг.

| Эвристика Nielsen | Балл 0–4 | Главное наблюдение |
|---|---:|---|
| Видимость состояния | 2 | Метрики и ошибки есть; disabled Save и состояние последних изменений не объясняются достаточно ясно |
| Соответствие предметной области | 2 | Track, route, segment, Day 1, Snap и Trace не образуют понятную модель |
| Контроль и свобода | 1 | Mobile теряет режимы и undo; нет видимого возвращения из редактора |
| Консистентность | 1 | Разные языки кнопок, форм, иконок, поверхностей и типографики |
| Предотвращение ошибок | 2 | Есть ограничение Save и recovery, но неприменимые advanced actions и ненадёжный draft |
| Узнавание вместо запоминания | 2 | Tabs помогают; emoji, скрытые настройки и F1–F4 на телефоне требуют догадок |
| Гибкость и эффективность | 2 | Есть shortcuts и богатые операции; touch-альтернативы неполны |
| Эстетика и минимализм | 1 | Повторные редакторы, пустые панели и раннее предъявление сложности |
| Восстановление после ошибок | 2 | Есть Reload/Manual и выход из missing-track; recovery не защищает весь сценарий |
| Помощь | 2 | Подсказки есть, но повторяются, описывают компоновку и не адаптированы к устройству |
| **Итого** | **17/40** | Основной сценарий нуждается в новой структуре |

### Техническое состояние: 5/16 по оценённым областям

| Область | Балл | Основание |
|---|---:|---|
| Доступность | 1/4 | Неподписанные controls, повторные id, unnamed canvas, неполные dialogs |
| Производительность | n/a | Повторные графики, eager imports и hints требуют измерений; production скорость не измерялась |
| Адаптивность | 1/4 | Потеря инструментов, clipping и почти полностью закрытая карта 320×568 |
| Общая система / tokens | 2/4 | Общие tokens существуют, но editor/account используют собственные системы |
| Целостность реализации | 1/4 | Ошибка CSS selector, stacking, повторные формы и потеря draft content |
| **Итого** | **5/16** | Четыре оценённые области; производительность исключена |

Исправление версии 2: прежний предварительный 2/4 за производительность и итог 7/20 удалены. Без замера численный performance score необоснован; наличие подозрительного кода не заменяет измерение. Остальные баллы сохраняют экспертный характер.

Отсутствие dark mode не объявляется дефектом: подтверждённого требования тёмной темы нет. Отсутствие h1/main в axe — best practice findings, а не автоматическое доказательство нарушения WCAG.

## 3. Покрытие живого интерфейса

Chromium 148 headless, две отдельные agent-browser сессии. Размеры: 1440×1000, 1280×900, 390×844, 320×740 и 320×568. Отдельно проверялся root text 200% на desktop; это **не настоящий browser zoom**.

| Поверхность | Реально проверено | Что остаётся вне текущего покрытия |
|---|---|---|
| Главная карта | Пустая область, область с треком, инструменты, фильтры desktop | Большие выдачи; полный touch-сценарий фильтров |
| Поиск | Открытие, focus, найденный реальный трек, mobile modal layers | Все ошибки и большие выдачи |
| Импорт | Раскрытая форма desktop/mobile; код validation/success | Реальные upload, duplicate и success UI не выполнялись |
| Создание | Пустой, двухточечный локальный маршрут, Info, More, missing routing | Реальное server save, экспорт и все сложные операции |
| Draft | Локальное восстановление и потеря изменения названия после reload | Исчерпывающая проверка всех полей/гонок |
| Просмотр | Реальный публичный трек, desktop/mobile, несуществующий трек | Все owner actions и все варианты неполных данных |
| Кабинет | Direct URL, anonymous/default User, пустота, настройки | Авторизованный профиль, длинный список, массовые операции |
| Подтверждения / auth callback | Исходники и контракты состояний | Реальные OAuth и destructive confirmation |

Не было записей в backend/DB, реального входа, upload/save/delete/export. Локальный draft изменялся только в изолированной браузерной сессии. Новые серверы не запускались; обе браузерные сессии закрыты. Feature flags в текущей среде: `auth:false`, `editor:true`.

При перепроверке выполнены свежие GET list/detail/flags, отдельная read-only browser проверка 1280×577 и in-memory вызов реального useDraftSave с mock localStorage. Подтверждены flat DTO, cold/warm flag race и состояние нового tooltip; timer race проверен без HTTP и без постоянного browser storage. Owner edit, server Save/POI и bulk изменения не вызывались. [Source/API evidence](2026-10-04-design-evidence/plan-recheck-source-contracts.json) фиксирует проверенные ответы и hashes исходников; прежние screenshots и axe не выдаются за актуальный снимок всех concurrent изменений.

Геометрия и hit testing подтверждают перекрытия. Снимки отражают живой интерфейс, без подмены API. Серые участки внешних OSM tiles на некоторых снимках не включены в дефекты дизайна: нет отдельного доказательства, что причина в layout. Два переходных/неудачных capture A исключены из сохранённого набора доказательств.

## 4. Пять главных направлений исправления

### 4.1. [P0/P1] Восстановить полноценный мобильный редактор

На 390×844 верхняя полоса и alert занимают **267,16 px**, карта как DOM-stage — **446,84 px**, постоянная панель — **240 px**, deck — **130 px**. На 320×568 карте остаётся stage **170,84 px**, который почти целиком накрыт панелью 240 px. Доступны узкие полосы карты примерно по 8 px; tabs панели оказываются выше clipping boundary. Это блокирует практическое рисование на компактном экране.

Одновременно `TrackEditorView.vue:1028,1044` скрывает единственные controls для режимов, Undo/Redo и POI. На больших телефонах это потеря управления задачей, даже когда первую точку поставить ещё возможно.

Причины: фиксированные размеры, полная desktop-композиция, отсутствие сворачивания панели и ошибочный selector для hide deck. [Снимок 320×568](2026-10-04-design-evidence/trackly-b-editor-320.png), [измерения](2026-10-04-design-evidence/trackly-b-editor-320-measure.json).

**Митигация:** отдельный touch workspace с доступными режимом, отменой и сохранением, одной управляемой панелью и полезной рабочей областью карты. Команда: `/impeccable adapt`.

### 4.2. [P1] Дать каждому решению одно место

Сегмент Day 1 показан слева, справа и снизу. Слева и снизу можно редактировать одни поля. Название и описание смонтированы в двух экземплярах; DOM содержит повторные `track-name`/`track-desc`, а accessibility tree — `Name * Name *` и `Description Description`.

Это заставляет искать «правильную» панель, увеличивает keyboard обход и ломает связи label/field. Пустой редактор уже требует думать о сегментах, метаданных, оптимизации и нескольких режимах.

**Митигация:** одно рабочее пространство, один редактор метаданных, один контекст выбранного объекта. Advanced operations раскрываются по задаче. Команды: `/impeccable shape`, `/impeccable layout`.

### 4.3. [P1] Исправить clipping и порядок слоёв

В desktop deck карточки имеют clientHeight **128 px**, а содержание занимает metadata **288 px**, actions **438 px**, chart **315 px**. `overflow:hidden` обрезает description, categories, optimizer и графики. На mobile правило скрытия `.editor-bottom-deck` не совпадает с root `.track-editor-bottom-deck`, и остаются обрубленные секции.

More перекрывается соседними поверхностями на обоих типах экранов. В 390×844 центр Snap `(24,179,306,36)` и Profile `(24,219,306,36)` попадает в Leaflet canvas, а на desktop — в inspector. `z-index:20` меню находится внутри stacking context TopBar с backdrop-filter. Наличие элемента в DOM не делает его пригодным для клика. Keyboard workaround возможен, поэтому это P1.

**Митигация:** единый владелец popover/modal layers, корректное позиционирование, hit testing и отказ от постоянно открытых обрезаемых форм. [More: снимок](2026-10-04-design-evidence/trackly-b-editor-more-mobile.png), [hit tests](2026-10-04-design-evidence/trackly-b-editor-more-mobile-hit.json). Команды: `/impeccable harden`, `/impeccable layout`.

### 4.4. [P1] Восстановить доверие к draft, сохранению и метрикам

После восстановления двухточечного local draft изменение названия на `Design audit draft title` обновило оба input и TopBar. Через 750 ms localStorage всё ещё содержал пустое имя и старый timestamp; reload + Restore вернул `Untitled track`. Это воспроизведённая потеря данных, а не стилистическое замечание.

`useTrackEditor.ts:184` сохраняет сегменты только как `{points}`; restore сбрасывает name/color и получает пустые waypoints/surfaceTypes. Metadata refs меняются напрямую, без autosave на каждое изменение.

Повторная проверка добавила две части F06: единственный draft key не содержит sourceTrackId/origin и предлагается только в `/tracks/new`; pending debounce после markClean/deleteDraft снова создаёт draft. Последнее подтверждено in-memory вызовом useDraftSave: `stored:false/dirty:false` после удаления → `stored:true/dirty:false` после timer. Это не сквозной server-save тест. [Timer proof](2026-10-04-design-evidence/trackly-recheck-draft-race-b.json).

Дополнительно по коду `useTrackPersistence.ts:398–433`: сохранение metadata запускает PATCH через `Promise.allSettled`, не проверяя HTTP status и результаты. Caller затем очищает draft. При неуспешной части операций UI может сообщить полный успех. Реальный failure-save не запускался; условие дефекта подтверждено исходниками.

Перед новой компоновкой также необходимо исправить load/POI/export контракты: существующий editor ожидает Feature вместо фактического flat DTO; новые POI не проходят путь server persistence; Export использует сохранённую версию и игнорирует false result. Подробности F23–F26 ниже. Без этих исправлений удобный новый экран сохранит прежние потери и ложные статусы.

Для одного реального трека поиск показывает **244,4 км**, detail — **129,58 км**. Два независимых GET подтверждают разные `length_km`; корректное значение и причина не установлены. [Доказательство API](2026-10-04-design-evidence/metric-contract.json), [draft proof](2026-10-04-design-evidence/trackly-b-draft-name-proof.json), [restore proof](2026-10-04-design-evidence/trackly-b-draft-restore-proof.json).

**Митигация:** полный draft contract, autosave и flush, достоверные dirty/saving/saved/failed состояния, проверка всех результатов, единое определение метрик. Команда: `/impeccable harden`.

### 4.5. [P1] Построить общую систему UI и доступности

Home использует компактные SVG controls и общий blue accent; editor — emoji, другой blue, большие радиусы, pills, мелкие native fields и отдельную типографику. Detail распределяет одну distance metric по всей ширине и показывает категории/overlay settings раньше главной оценки маршрута. Account — отдельная визуальная система.

Axe и код подтверждают неподписанные routing selects, color/range controls, canvas без accessible name, некорректный `aria-label` на span. ConfirmDialog и nickname modal не реализуют полноценный keyboard/focus contract. Контраст `0 tracks` в Account — **4,39:1** для обычного текста, ниже требуемых 4,5:1.

**Митигация:** общие роли tokens, типографика, интервалы, кнопки, поля, иконки, menu/dialog/sheet и states. Dialogs должны управлять focus, закрываться клавиатурой и возвращать focus. Команды: `/impeccable document`, `/impeccable typeset`, `/impeccable harden`.

## 5. Реестр для митигации

Статус «код» означает проверенное условие в реализации, без вызова реального изменяющего API. «Дизайн» — экспертное заключение из live-композиции. P0 блокирует задачу в указанном состоянии; P1 серьёзно затрудняет её; P2 ухудшает опыт с доступным обходом.

| ID | Приоритет | Проблема / влияние | Доказательство и место | Что изменить |
|---|---|---|---|---|
| F01 | P0 | На 320×568 карта почти полностью закрыта; практическое рисование недоступно | Live geometry; `TrackEditorView:1016`, stage 170,84 / panel 240 | Compact workspace и управляемая панель — `adapt` |
| F02 | P1 | Mobile теряет modes, Undo/Redo, POI и их контекст | Live + `TrackEditorView:1028,1044` | Доступные touch replacements — `adapt` |
| F03 | P1 | More controls визуально скрыты и не получают pointer input | Live hit tests; `TopBar:382,498` | Общий overlay owner/portal и layer contract — `harden` |
| F04 | P1 | Deck обрезает формы/действия; mobile hide не срабатывает | Live + `BottomDeck:153–180`, `TrackEditorView:1049` | Убрать clipping; заменить deck задачами/сводкой — `layout` |
| F05 | P1 | Два экземпляра metadata/segments и повторные id | Live DOM + `View:98,176`, `InspectorOverview:65,82` | Единственная editable surface и уникальные id — `harden` |
| F06 | P1 | Metadata/структура теряются, нет origin draft, pending timer воскрешает удалённое содержимое | Live reload + `useTrackEditor:184,714`; `useDraftSave:4,118,145`, in-memory timer proof | Полная versioned schema с origin, autosave/flush, отмена timer и защита конфликтов tabs — `harden` |
| F07 | P1 | Неуспех metadata PATCH не препятствует Saved; cleanup не защищает правки во время запроса | Код `useTrackPersistence:348–351,385–386,398–433` | Проверять responses; конкретная revision, single-flight, dirty/draft при partial/unknown outcome — `harden` |
| F08 | P1 | Нет видимого выхода из editor; Saved зависит от ID, причина disabled Save не ясна | Live + `TopBar:14,164`, `useTrackEditor:759` | Навигация, dirty-aware status и объяснение требования рядом с действием — `clarify` |
| F09 | P1 | Создание начинает с routing failure и другим географическим контекстом | Live, WASM 404; `TrackEditorMap:479`, `useRouting:15`, `TopAlertStrip:45` | Восстановить routing delivery; явный способ построения; перенос центра карты; touch copy — `harden` / `onboard` |
| F10 | P1 | Экран организован по модулям и преждевременно предлагает сложные решения | Дизайн; `LeftPanel:25–99`, `ActionsCard:6–49` | Task IA и progressive disclosure — `shape` / `distill` |
| F11 | P1 | Select, range, color и chart не имеют полного accessible name/role contract | Live axe; `TopBar:85,102`, `InspectorSegments:54`, `Optimizer:15`, `ElevationChart:12`, `CategoriesPanel:74` | Label/name/state, chart summary; WCAG 1.1.1/3.3.2/4.1.2 по применимости — `harden` |
| F12 | P1 | ConfirmDialog и nickname modal не обеспечивают полный modal focus/keyboard contract | Код `ConfirmDialog:3–49`, `AccountView:147–236` | Semantics, initial focus, containment, Escape, return focus — `harden` |
| F13 | P1 | Один маршрут имеет разные distance в list/search и detail | Live + GET evidence; `metric-contract.json` | Каноническое определение и contract regression; правильное значение сначала установить — `harden` |
| F14 | P1 | Важные surfaces используют разные визуальные и поведенческие системы | Дизайн + `App:77–127`, `TopBar:365`, `AccountView:663` | Единая система roles/tokens/primitives — `document` / `typeset` |
| F15 | P2 | Create и Upload трудно обнаружить и связать: icon-only в противоположных углах | Live; `HomeView:33,101–131` | Явный общий вход в добавление; назвать действия — `clarify` / `onboard` |
| F16 | P1 | Detail плохо помогает быстро оценить маршрут: большой sheet, мало информации сверху | Дизайн live; `TrackDetailPanel:423–581,2414` | Title + основные metrics/actions, затем profile/details, пригодная desktop/mobile плотность — `layout` |
| F17 | P1 | File picker скрыт через display:none, label не focusable; Name опирается на placeholder | Код `UploadForm:15–43`; выбор файла только клавиатурой не обеспечен | Доступный trigger/input и постоянные labels; WCAG 2.1.1/3.3.2 по применимости — `harden` |
| F18 | P2 | Итог upload с постоянной ссылкой исчезает через 5 s; нет явного uploading state, copy упоминает только GPX | Код `UploadForm:20,164,265–309` | Устойчивый итог, progress/locking/retry и корректные GPX/KML подписи — `onboard` / `clarify` |
| F19 | P2 | Categories выглядят и валидируются по-разному: 4 chips / 6 + custom options / иной edit contract | Код `InspectorOverview:143`, `UploadForm:195`, `CategoriesPanel:44` | Один contract и control; сохранить уже поддерживаемые значения — `clarify` / `harden` |
| F20 | P2 | Cold Account доступен при auth:false, warm переход отклоняется; guest/error легко выглядят как empty account | Live cold/warm + `featureFlags:5`, `router:83`, `App:47`; `useTrackList:62` скрывает initial error пустым списком | Дождаться flags до guard; guest/loading/authorized/error states и truthful empty state — `harden` / `onboard` |
| F21 | P2 | Search modal расположен ниже map controls/filters/upload | Live + `TrackSearch:415`, `HomeView:871,984` | Единая modal plane и inert background; сохранить действующие Escape/trap — `harden` |
| F22 | P1 | Контраст count в Account ниже AA | Live axe: `.track-count` 4,39:1; `AccountView:1034` | Изменить semantic text/background pair; WCAG 1.4.3 — `harden` |
| F23 | P1 | POI add не сохраняется в existing Save; create backend игнорирует pois; existing POI update/delete имеют immediate contract и local-only Undo | Код `useTrackEditor:421,474,503`, `useTrackPersistence:327,366`, `backend/services/track_editor:91` | Согласовать staged/immediate Save/Undo/Discard, временные IDs, create/link/unlink и server readback |
| F24 | P1 | Export/duplicate берут server revision; export false приводит к success; duplicate не копирует segment_meta/POI links | Код `useTrackPersistence:140,180,213`, `View:628`, `backend/db/tracks/editor:121–144` | Явные revision/scope, проверка результата и содержимого; не обещать полную копию без roundtrip |
| F25 | P1 | «Select all» при query выбирает скрытые loaded tracks; поиск ограничен loaded page и ошибки initial fetch выглядят пустотой | Код `AccountView:569`, `useBulkTrackOperations:31`, `useTrackSearch:16`, `useTrackList:34,62` | Точный selection/request scope; честный loaded/global поиск, paging/error/retry; destructive confirmation |
| F26 | P1 | Editor load ожидает properties/geometry вместо real flat DTO; waypoints не возвращаются/игнорируются | GET 200 + `useTrackPersistence:263–266`, `useTrackEditor:585`, `useTrackGeometry:249–265` | Актуальный DTO adapter, полная geometry/anchors/metadata load и save/reload contract tests |
| F27 | P2, пустое содержимое исправлено | Новый disabled-help tooltip был пустым; внешнее исправление подтверждено свежим focus check | Сначала нет data-tooltip/::after пуст; затем `StatisticsPanel:102` получил data-tooltip, live focus показывает текст | Пустой tooltip закрыт для focus-сценария; touch/help contract остаётся в общей приёмке, без заявления о доказанном touch дефекте |

Уточнение F23: нельзя утверждать, что любые POI update/delete локальны. Для уже сохранённых server POI wrapper вызывает API сразу; именно смешение локального add, immediate правки и local Undo требует общего контракта. New-track create принимает поле `pois`, но не передаёт его в DB/POI сервис; existing Save не создаёт новые локальные POI. Реальные изменяющие вызовы не выполнялись.

F25 установлен по реализации, без запуска bulk delete: checked state вычисляется по filteredTracks, а toggleSelectAll использует весь loaded tracks массив. Скрытые query результаты могут попасть в request IDs. P1 связан с потенциальной массовой операцией над иной областью, а не с отсутствием сортировки.

F26 подтверждён текущим GET: root name/categories и geom_geojson MultiLineString присутствуют, properties/geometry отсутствуют. Даже после DTO fix нужно отдельно исправить anchors: `fromGeoJSON` игнорирует `_waypoints` и делает все vertices waypoints. Owner UI flow не проходился с подменой прав; утверждение относится к API/source несовместимости. [DTO/tooltip capture](2026-10-04-design-evidence/trackly-recheck-tooltip-dto-b.json).

F27 не включается в текущий список неисправленных пустых tooltips. На свежем focus check после внешнего изменения текст показан полностью, `visibility:visible`, `opacity:1`; touch не проверялся. [Проверка актуальности](2026-10-04-design-evidence/trackly-tooltip-freshness-b.json). Cold/warm Account race также подтверждён отдельно: [cold](2026-10-04-design-evidence/trackly-recheck-account-cold-b.json), [warm](2026-10-04-design-evidence/trackly-recheck-account-warm-b.json).

## 6. Системные паттерны, которые нужно закрыть

- **Владение layout и слоями размыто.** View и child roots используют разные имена; menu z-index локален внутри чужого stacking context. Для общего overlay contract недостаточно увеличить случайное число z-index.
- **Декомпозиция не равна UX-структуре.** Повторное использование компонентов создаёт несколько редакторов одного объекта. Overview должна быть сводкой, а редактирование иметь одно место.
- **UI status не связан с жизненным циклом данных.** ID, dirty, draft, local save и server save не разделены. Это вызывает реальные потери и ложную уверенность.
- **Tokens не определяют все surfaces.** В App есть база, но editor/account обходят её. Плотность может различаться по роли; смысл и поведение кнопок/полей должны оставаться общими.
- **Тесты защищают текущую компоновку вместо пользовательской задачи.** Три выбранных теста прошли за 1,3 s; `track-editor.spec.ts:179` явно требует скрытую mobile rail. Тесты не проверяют замену инструментов, hit targets More, доступность обрезанных полей и последние metadata в draft.

## 7. Что работает и что сохранить

Карта и прямое редактирование — естественная основа GPS-инструмента. Предметные возможности уже богаты: маршрутизация, сегменты, высота, POI и экспорт. Общий focus ring и подписанные Home controls полезны. Поиск имеет dialog semantics, Escape, focus trap и возврат focus. Toast поддерживает `role=status`/`aria-live`. Missing-track state даёт понятную причину и конкретный выход. Routing failure предлагает ручную альтернативу, хотя общий сценарий recovery требует ремонта.

## 8. Нагрузка, пользователи и эмоциональный сценарий

В редакторе провалены 6 из 8 пунктов cognitive-load checklist: единый фокус, смысловое разбиение, иерархия, одна задача за раз, ограничение одновременных решений и progressive disclosure. Grouping частично работает внутри отдельных tabs/cards; working memory ухудшается при поиске одного объекта в нескольких панелях. Пять modes и семь разнотипных More controls требуют переоценки группировки. Само количество вариантов в dropdown не является универсальным дефектом.

- **Новичок:** не связывает route icon с созданием, видит Day 1 и Snap/Trace до первого результата, не понимает disabled Save.
- **Человек с телефоном одной рукой:** не находит отмену ошибочного tap, не управляет sheet, большая часть экрана занята служебными блоками.
- **Keyboard/low-vision пользователь:** встречает поля без имени, два экземпляра форм и перекрытые controls; символы операций требуют tooltip. Полный screen-reader опыт не проверялся.

Эмоционально человек переходит от просторной карты к экрану с ошибкой и многими одновременными решениями. Первый полезный результат — построенная линия — не защищён достоверным draft/save feedback. Целевой сценарий должен последовательно давать ориентацию, управляемое действие, проверку и уверенное завершение с доступной ссылкой.

## 9. Детектор и доступность: результаты без ложных выводов

Impeccable detector запускался один раз по `frontend/src`: **15 warnings, 3 правила, 6 активных файлов**. [Полный JSON](2026-10-04-design-evidence/trackly-detector-assessment-b.json).

| Правило | Количество | Контекстный вывод |
|---|---:|---|
| `side-tab` | 8 | Маркеры состояния toast, уклона, error и selection. Не доказательство дефекта UI или происхождения кода |
| `bounce-easing` | 3 | Overshoot easing подтверждено; вред пользователю не измерен, вторичная унификация motion |
| `layout-transition` | 4 | Три false positives: `stroke-width` принят за layout width. Одна настоящая height transition в filters; jank не измерялся |

Локации: `ElevationChart:1046`, `Toast:81–84`, `TrackDetailPanel:2427,2858,3050`, `InspectorSegments:168`, `TrackMap:903,906,959,1008`, `TrackFilterControl:910`. Детектор не нашёл главные функциональные проблемы: их установили design review, geometry/hit tests и draft reproduction.

Axe 4.12.1: Home — 3 best-practice rule findings; editor — 4 при закрытом More, 5 при открытом; detail — 3; Account — 4; search — 1 region. Эти числа нельзя складывать в число уникальных дефектов. Duplicate id в axe имеет статус incomplete; факт повторных id отдельно подтверждён DOM. Incomplete contrast для перекрытых controls не выдан за подтверждённое нарушение. [Editor axe](2026-10-04-design-evidence/trackly-b-editor-mobile-overflow-a11y.json), [Account axe](2026-10-04-design-evidence/trackly-b-account-desktop-a11y.json).

Многие editor targets меньше проектных 44×44 px: tabs 37 px, More/Save 36 px, Reload/Manual 24 px, segment actions примерно 17–23×24 px. Это проблема touch-удобства. Для WCAG 2.2 AA SC 2.5.8 применяется минимум 24×24 с исключениями по spacing/эквивалентам; все элементы меньше 44 нельзя автоматически объявить AA failure. [W3C: target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Для modal нужны семантика и управление focus; поиск частично уже реализует этот контракт, ConfirmDialog — нет. [W3C: modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Для reflow двумерная карта может иметь исключение; формы и немаповые controls всё равно должны адаптироваться. [W3C: reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

Live detector overlay не инжектировался: он требует отдельного live-server, а проект запрещает запуск серверов. Screenshots/DOM/hit tests получены. Пользовательский overlay в браузере не обещается.

## 10. Риски и ограничения, не выданные за доказанные дефекты

Производительность production build, Core Web Vitals, bundle bytes, FPS и задержки на крупном треке не измерялись. Повторные chart instances, eager TrackView и широкие will-change hints требуют профиля, но не доказывают тормоза сами по себе.

Geometry UPDATE (`backend/db/tracks/editor.rs:80–85`) сохраняет прежние elevation/time/HR/speed/slope series. Их корректная привязка после геометрической правки записанного трека не доказана; metadata-only edit и изменение оригинальной записи требуют разных data gates. Потерянный ответ create, concurrent save/edit, shared POI deletion и duplicate completeness также требуют controlled roundtrip. Они включены в план как обязательные проверки, без заявления о проведённом server failure тесте.

Backend `response.url` для create/duplicate имеет `/tracks/:id`, а router — `/track/:id`. Текущие editor navigation и Upload copy строят рабочий route самостоятельно; поэтому это API seam, а не подтверждённая сломанная UI-ссылка. Проверка URL contract добавлена в план.

Trace и waypoint drag имеют touchstart/move/end; отсутствие очевидного touchcancel/blur cleanup — риск по коду, без воспроизведения жестом. Глобальный reduced-motion kill на 0,01 ms требует проверки settled states; потеря полезной обратной связи в этом аудите не доказана. В editor `height:100vh` следует после `100dvh` и перекрывает его; реальное поведение Safari/клавиатуры остаётся отдельной проверкой.

Авторизованная populated коллекция не тестировалась. У Account **есть** внутренний scroll `.tracks-list-container` (`AccountView:1185`); предположение о полном отсутствии scroll отклонено при синтезе. Проверить длинные списки/масштабирование всё равно нужно.

Физические iPhone/Safari, VoiceOver, настоящие browser zoom/reflow и touch drag/swipe/pinch/cancel не проверялись. Текущий отчёт не является сертификатом WCAG или подтверждением всех сквозных операций.

## 11. План действий

Полный [план митигации](2026-10-04-design-mitigation-plan.md) включает новую архитектуру всех поверхностей, последовательность работ, матрицу состояний и acceptance gates.

1. **Восстановить доступ и доверие:** DTO load, draft/revision/POI/export, bulk scope, routing delivery, mobile tools, More/clipping и канонические метрики — `/impeccable adapt`, `/impeccable harden`.
2. **Спроектировать новую IA:** задачи, переходы, единственное место каждого решения, desktop и mobile — `/impeccable shape`.
3. **Создать общую систему:** целевое решение и первые новые tokens/primitives, затем зафиксировать реализованную новую систему — `/impeccable document`, `/impeccable typeset`. Не документировать старый UI как нормативный перед redesign.
4. **Пересобрать редактор и остальные поверхности:** карта + одна рабочая панель, contextual tools, управляемый mobile sheet; затем details/import/search/library — `/impeccable layout`, `/impeccable clarify`, `/impeccable onboard`.
5. **Проверить задачи и завершить:** Playwright сценарии, доступность, данные, реальный touch, bounded visual pass и production measurements — `/impeccable audit`, затем `/impeccable polish`.

Вопросы пропущены: пользователь уже задал весь охват, приоритет создания, цель консистентности и разрешение пересмотреть структуру с чистого листа. Дополнительный выбор приоритетов не нужен для завершения аудита и плана. Реализация не начата.

## 12. Результат перепроверки плана

Усилены зависимости и условия выхода этапов, identity/revision/persistence contracts, routing readiness, recorded-data integrity, scope поиска/выбора и flags. Добавлены capability ledger, альтернативы drag и chart readout, различие modal/non-modal sheet, representative fixtures и mapping всех F-ID до acceptance evidence. Из плана убран преждевременный `/impeccable document`, который мог закрепить старую систему; performance score исключён как неизмеренный.

Перепроверка исправила конкретные пробелы, но не доказывает универсальную полноту или удобство будущей композиции. Ни план, ни scores не подменяют server roundtrip, physical device/a11y и production performance gates. Все оставшиеся неизвестные перечислены в разделе 12 плана; их закрытие предшествует утверждению готовности соответствующих поверхностей.
