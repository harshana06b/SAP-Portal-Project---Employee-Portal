# Employee Portal - Deep Technical Review README

This README is written for a deep code review, viva, architecture discussion, and senior developer interview. It explains the SAP Employee Portal source files in a reviewer-oriented way: what each file does, why it exists, why the main keywords/imports/design choices were used, what breaks if they are removed, and what questions a reviewer may ask.

Generated and dependency folders such as `node_modules`, `.git`, `dist`, Angular cache folders, binary PDFs, and private `.env` values are intentionally excluded. The same architecture pattern can be reused for Customer, Vendor, Maintenance, and EHSM portals: Angular owns the portal experience, Express protects and normalizes APIs, and the service layer hides SAP OData details.

## Architecture Overview

The project is a two-tier portal:

- `frontend/`: Angular standalone SPA using Angular Material, signals, guards, interceptors, and services.
- `backend/`: Node.js Express API using SAP OData, JWT authentication, SAP CSRF handling, local helper stores, PDF streaming, and Gmail mail delivery.
- SAP integration: OData service `ZEMPLOYEE_NEW_SRV` with entity sets such as `EmpLoginSet`, `EmpProfileSet`, `LeaveRequestNewSet`, `LeaveHistoryNewSet`, `PaySlipNewSet`, and `PaySlipPdfSet`.
- Security boundary: SAP credentials, Gmail app password, and JWT secret stay in `backend/.env`; the frontend only talks to `/api`.

Typical flow:

1. Angular login form sends employee credentials to `POST /api/login`.
2. Express controller calls SAP `EmpLoginSet` through `sapService.postLogin`.
3. Backend issues a JWT for the portal session.
4. Angular stores the session, interceptor adds `Authorization: Bearer <token>`.
5. Protected routes call backend endpoints for profile, leave, and payslip.
6. Backend uses SAP OData, normalizes SAP-specific fields, and returns frontend-friendly JSON or PDF blobs.

## Technology Decisions

- Angular standalone components were chosen to avoid heavy NgModule boilerplate and keep each feature self-contained.
- Angular signals were chosen for local reactive UI state because dashboard filters, loading states, selected tabs, and computed totals are synchronous UI state.
- RxJS is still used for HTTP because Angular `HttpClient` returns observables and supports operators such as `map`, `tap`, `catchError`, `shareReplay`, and `finalize`.
- Express was chosen because it is lightweight and enough for a portal middleware layer.
- Axios was chosen for SAP OData calls because it supports base URLs, Basic Auth, custom headers, response types, timeout, and manual status validation.
- JWT was chosen to avoid storing SAP credentials in the browser after login.
- SAP CSRF token fetch is required before mutating OData operations such as login POST, leave creation, cancellation, and withdrawal.
- Local JSON stores are used only as helper overlays for submitted/withdrawn leave states where SAP response timing or returned fields may not immediately match the UI need.
- Nodemailer is used because payslip mail is a backend concern and should never expose Gmail app passwords in Angular.

## Keyword Guide Used Across The Project

### JavaScript / Node

- `const`: block-scoped constant binding. Used for imports, configuration, routers, and helper references that should not be reassigned. If replaced with `let`, code still works but communicates weaker intent.
- `let`: block-scoped mutable binding. Used for values that change, such as `sessionCookies`, `lastError`, and query params. If replaced with `const`, reassignment breaks.
- `function`: named reusable behavior. Used heavily in backend because CommonJS modules export functions cleanly and named stack traces help debugging.
- `async`: returns a Promise and allows `await`. Used for SAP, mail, and controller functions because they perform I/O.
- `await`: pauses inside `async` until the Promise resolves. If removed, code may send unresolved promises or skip error handling.
- `module.exports`: CommonJS export mechanism. Used because backend package has `"type": "commonjs"`.
- `require`: CommonJS import mechanism. If replaced with `import`, the backend package type or transpilation must change.
- optional chaining `?.`: safely accesses possibly missing fields from SAP/HTTP errors. Removing it can cause `Cannot read property` runtime crashes.
- nullish coalescing `??`: defaults only for `null` or `undefined`, preserving valid values like `0`. Replacing with `||` may incorrectly treat `0` or empty strings as missing.

### TypeScript / Angular

- `export`: makes classes, interfaces, constants, and routes available to other files. Removing it breaks imports.
- `interface`: compile-time shape contract for API data. Used instead of classes because SAP/backend data is plain JSON and does not need constructors.
- `type`: compile-time alias for unions or object shapes, such as `JsonObject` and `LeaveDatasetKey`.
- `class`: runtime construct for Angular components/services. Angular decorators attach metadata to classes.
- `private`: restricts member access inside the class. Used for injected services and helper methods to protect component/service APIs.
- `readonly`: prevents reassignment after initialization. Used for signals, injected services, columns, and config references.
- `protected`: used in `App` for template-facing state without making it public API to other classes.
- `constructor`: used when decorator injection is clearer or required, especially dialog data via `@Inject(MAT_DIALOG_DATA)`.
- `inject()`: Angular functional dependency injection. Used to avoid constructor noise in standalone services/components.
- `@Component`: tells Angular that the class is a component and defines selector/template/style/imports/change detection.
- `@Injectable`: tells Angular DI that a service can be injected.
- `standalone: true`: component imports dependencies directly instead of belonging to an NgModule.
- `ChangeDetectionStrategy.OnPush`: improves performance by checking mainly on input/signal/observable/event changes instead of broad tree scans.
- `signal`: reactive state holder. Used for UI state such as loading, filters, records, and theme.
- `computed`: derived reactive value. Used for totals, filtered records, chart data, and labels.
- `input.required`: Angular signal input for reusable components where a parent must provide a value.
- `implements OnInit/OnDestroy/AfterViewInit`: declares lifecycle contracts. Removing it does not always break runtime, but weakens type checking and reviewer clarity.

## Backend File-by-File Review

### `backend/server.js`

#### 1. File Overview

Purpose: Bootstraps the Express backend server, loads environment variables, registers middleware, mounts API routes, exposes a health route, and starts listening.

Why needed: It is the backend entry point defined by `backend/package.json` as `"main": "server.js"` and used by `npm start`.

Architecture role: API bootstrap / backend runtime composition.

#### 2. Imports Analysis

- `node:path`: builds an absolute path to `backend/.env`. Removing it risks loading `.env` from the wrong working directory.
- `express`: creates the HTTP server and routing middleware. Alternative: Fastify/NestJS, but Express is simpler for this portal.
- `cors`: permits Angular dev server to call the backend. Without it, browser CORS blocks local frontend calls.
- `dotenv`: loads SAP/JWT/mail config from `.env`. Without it, SAP credentials and port config are missing.
- `./routes/api`: isolates endpoint definitions from bootstrapping. Without it, all routes would clutter `server.js`.

#### 3. Class Analysis

No class is used. A functional bootstrap style is appropriate because the file performs one-time process setup, not reusable domain modeling.

#### 4. Keyword-by-Keyword Analysis

- `const`: used for modules and immutable configuration references.
- `require`: used because backend is CommonJS.
- `process.env.PORT || 4000`: allows deployment override while keeping local default.
- `app.use`: registers middleware in order. Order matters: CORS and JSON parsing must run before API routes.
- arrow functions in routes/listen: concise callbacks for Express.

Reviewer may ask: Why is `.env` loaded with `path.resolve(__dirname, '.env')`? Answer: to guarantee the backend env file loads even if the command is started from the workspace root.

#### 5. Variable Analysis

- `apiRouter`: Express router instance from `routes/api.js`; lifecycle is process-wide.
- `app`: Express application; singleton runtime object.
- `PORT`: string/number from environment; used once during startup.

#### 6. Function/Method Analysis

- `app.get('/')`: health check for quick backend availability.
- error middleware: catches Express errors and normalizes fallback response.
- `app.listen`: starts the HTTP process.

#### 7. API / Backend / SAP Integration

This file does not call SAP directly. It delegates all `/api` calls to routes/controllers/services.

#### 8. Architecture Decisions

Keeping bootstrap separate from route/controller/service logic improves maintainability and makes the same backend pattern reusable for Customer/Vendor/Maintenance/EHSM portals.

#### 9. Reviewer Questions

- Beginner: What does `express.json()` do?
- Intermediate: Why mount routes under `/api`?
- Senior: What changes are needed for production CORS and centralized logging?
- Why: Why load `.env` before importing routes? Because services read env vars during module load.
- Trick: Does `cors()` alone authenticate users? No, it only controls browser cross-origin access.

#### 10. Paste-Ready Comments

```js
// Load backend-specific environment variables before importing modules that depend on process.env.
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Register cross-cutting middleware before route handlers so every API request is parsed consistently.
app.use(cors());
app.use(express.json());
```

#### 11. Presentation Mode

1-minute: `server.js` starts the Express API, loads `backend/.env`, enables CORS/JSON parsing, mounts `/api`, and exposes a health route.

3-minute: It is intentionally small because controllers and services own business logic. The important detail is env loading before route imports, because SAP service config is read at module load time.

Deep technical: In production, this file is where we would tighten CORS origins, add request logging, rate limiting, helmet headers, process-level error handling, and move secrets into a managed secret store.

### `backend/routes/api.js`

#### 1. File Overview

Purpose: Defines the backend HTTP contract for login, profile, leave, and payslip operations.

Why needed: Keeps endpoint paths separate from business logic and makes route protection visible.

Architecture role: API routing layer.

#### 2. Imports Analysis

- `express`: provides `Router`.
- controller functions from `portalController`: route handlers.
- `verifyToken`: protects portal routes after login.

Removing controller imports breaks route handlers. Removing `verifyToken` makes sensitive SAP employee data publicly reachable.

#### 3. Class Analysis

No class. Express routers are usually configured functionally.

#### 4. Keyword Analysis

- destructuring import from controller groups endpoint handlers by name.
- `router.get/post/delete`: maps HTTP methods to semantics.
- `module.exports`: exposes router to `server.js`.

#### 5. Variable Analysis

- `router`: singleton Express router, lives for process lifetime.

#### 6. Function/Method Analysis

Each route delegates to a controller. Design keeps route file declarative:

- `POST /login`: public authentication.
- `GET /profile/:id`: protected employee profile.
- `GET /leave/...`: protected leave list/balance/history/analytics.
- `POST /leave/request`: protected leave creation.
- `DELETE /leave/:pernr/:leaveType/:begda`: protected withdrawal.
- `GET /payslip/download`: protected PDF stream.
- `POST /payslip/mail`: protected email operation.

#### 7. SAP Integration

Routes do not know SAP entity sets. They define portal business URLs; controllers/services translate to SAP OData.

#### 8. Architecture Decisions

Backend URLs are domain-friendly (`/leave/requests`) instead of exposing SAP entity set names directly. This allows SAP service changes without changing Angular.

#### 9. Reviewer Questions

- Beginner: Why is login not protected by `verifyToken`?
- Intermediate: Why use `DELETE` for withdrawal?
- Senior: Should `:id` match the JWT `pernr`? Yes, for stronger authorization.
- Why: Why not call SAP directly from Angular? To keep SAP credentials and network details server-side.
- Trick: Does `verifyToken` prove SAP authorization? It proves portal session validity; SAP authorization still happens via backend SAP user/service.

#### 10. Paste-Ready Comments

```js
// Keep login public so the user can obtain a JWT; every employee data route is protected below.
router.post('/login', login);

// Route paths describe portal operations while services hide SAP OData entity set details.
router.get('/payslip/:id', verifyToken, getPayslip);
```

#### 11. Presentation Mode

1-minute: This file is the API map. It connects frontend URLs to controller methods and applies JWT protection.

3-minute: It separates HTTP contract from SAP logic. Reviewers can see which routes are public, protected, read-only, mutating, or binary PDF endpoints.

Deep technical: In a senior review, discuss adding per-employee authorization checks so an authenticated user cannot request another employee's data by changing the URL.

### `backend/middleware/authMiddleware.js`

#### 1. File Overview

Purpose: Verifies JWT bearer tokens before protected route handlers run.

Why needed: Prevents unauthenticated access to employee profile, leave, payslip, and mail APIs.

Architecture role: Middleware / authentication.

#### 2. Imports Analysis

- `jsonwebtoken`: verifies token signature and expiry.

Alternative: Passport.js, express-jwt, OAuth2/JWT from an identity provider. Current choice is simple and project-local.

#### 3. Class Analysis

No class. Middleware is a function matching Express `req, res, next`.

#### 4. Keyword Analysis

- `const JWT_SECRET`: immutable config reference.
- `function verifyToken`: named middleware for stack traces and exports.
- optional chaining in `header?.startsWith`: prevents crash when header missing.
- `try/catch`: separates valid token path from invalid/expired token path.
- `next()`: passes control to protected route when authenticated.

#### 5. Variable Analysis

- `header`: authorization header string or undefined.
- `token`: extracted bearer token; short-lived per request.
- `req.user`: decoded JWT payload attached for downstream use.

#### 6. Function Analysis

`verifyToken(req, res, next)`:

1. Reads `Authorization` header.
2. Extracts token only if header starts with `Bearer `.
3. Returns 401 if absent.
4. Verifies with `JWT_SECRET`.
5. Attaches decoded payload to `req.user`.
6. Calls `next()`.
7. Returns 401 on invalid/expired token.

Edge cases: missing header, malformed prefix, expired token, wrong secret.

Security note: fallback secret is acceptable only for local development; production must set strong `JWT_SECRET`.

#### 7. SAP Integration

No direct SAP call. It protects the backend before SAP is contacted, reducing unnecessary SAP traffic.

#### 8. Architecture Decisions

JWT auth is centralized as middleware so each controller does not repeat token parsing.

#### 9. Reviewer Questions

- Beginner: What is a bearer token?
- Intermediate: Why use `header.slice(7)`?
- Senior: How do you prevent employee A reading employee B data? Compare `req.user.pernr` with route params.
- Why: Why store decoded token on `req.user`? So downstream authorization can use it.
- Trick: Is JWT encryption? No, JWT is signed, not encrypted, unless JWE is used.

#### 10. Paste-Ready Comments

```js
// Accept only the standard Bearer token format used by the Angular auth interceptor.
const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

// jwt.verify validates both signature and expiry before the request reaches SAP-backed handlers.
req.user = jwt.verify(token, JWT_SECRET);
```

#### 11. Presentation Mode

1-minute: This middleware checks the Angular session token and blocks invalid requests.

3-minute: It protects SAP-backed portal APIs by requiring `Authorization: Bearer <token>`, verifying the JWT, and returning consistent 401 responses.

Deep technical: For production, add strong secrets, token issuer/audience checks, refresh-token strategy, and per-PERNR authorization.

### `backend/controllers/portalController.js`

#### 1. File Overview

Purpose: Translates HTTP requests into service calls and returns consistent API responses.

Why needed: Keeps Express request/response handling separate from SAP OData implementation.

Architecture role: Controller layer.

#### 2. Imports Analysis

- `sapService`: all SAP OData operations.
- `mailService`: payslip email delivery.
- `setPdfHeaders`: PDF response headers.
- `jsonwebtoken`: signs JWT after SAP login succeeds.

#### 3. Class Analysis

No class. Controller functions are stateless and map naturally to Express route handlers.

#### 4. Keyword Analysis

- `async function`: controller waits for SAP/mail I/O.
- destructuring `const { id } = req.params`: makes required input explicit.
- `return res.status(...).json(...)`: stops execution after validation failure.
- ternary in PDF paths: supports both direct SAP `$value` URL and entity-key based PDF fetch.
- spread `...data`: merges contextual error information.

#### 5. Variable Analysis

- `JWT_SECRET`, `JWT_EXPIRES_IN`: config values; process-wide constants.
- `username/password`: login payload; request scoped; should not be logged in production.
- `profile`, `leaveData`, `history`, `requests`, `payslipData`: normalized service results.
- `pdfBuffer`: binary PDF from SAP; memory cost grows with file size.
- `fileName`: deterministic download/mail attachment name.
- `info`: Nodemailer result containing `messageId`.

#### 6. Function Analysis

- `login`: validates credentials, calls SAP login, signs JWT, returns session.
- `getProfile`: validates employee id, fetches normalized profile.
- `getLeave`: fetches leave records and count.
- `getLeaveBalance`: returns balance records.
- `getLeaveHistory`: returns historical leave records.
- `getLeaveRequests`: supports route param or query `pernr`.
- `createLeaveRequest`: posts leave request to SAP and returns 201.
- `cancelLeaveRequest`: attempts SAP DELETE/cancel path by request id.
- `withdrawLeaveRequest`: accepts params or body, calls SAP delete by Pernr/LeaveType/Begda.
- `getLeaveAnalytics`: returns backend-built analytics and SAP metadata.
- `getPayslip`: returns payslip list filtered by month/year.
- `downloadPayslip`: streams PDF using `setPdfHeaders`.
- `mailPayslip`: downloads PDF then sends mail through backend.
- `handleControllerError`: centralizes structured SAP error response handling.

Error handling: SAP service throws objects like `{ status, message, code, details }`. Controller preserves status and returns safe JSON.

Edge cases: missing id, missing PDF parameters, SAP network error, no SAP data, invalid leave dates, mail password missing.

#### 7. SAP Integration

Controller delegates to service methods that call SAP OData entity sets. It does not build SAP URLs itself, except deciding whether PDF should be fetched by URL or entity keys.

#### 8. Architecture Decisions

Controllers keep response shape consistent:

```json
{ "success": true, "message": "...", "data": {} }
```

This gives Angular one predictable contract even though SAP OData responses can vary between `d`, `d.results`, and raw binary streams.

#### 9. Reviewer Questions

- Beginner: Why validate request params before calling service?
- Intermediate: Why use HTTP 201 for leave creation?
- Senior: Should login expose `sapResponse` to frontend? Consider minimizing raw SAP data in production.
- Why: Why use `handleControllerError` instead of repeating catch logic? It reduces inconsistent error responses.
- Trick: Does JWT login mean SAP session is reused per employee? No, backend uses configured SAP credentials for OData calls and JWT for portal session.

#### 10. Paste-Ready Comments

```js
// Controller validates portal-level input before spending a network call on SAP.
if (!id) {
    return res.status(400).json({ success: false, message: 'Employee ID is required', data: null });
}

// Keep PDF header logic in a utility so download and preview behavior remains consistent.
setPdfHeaders(res, fileName, disposition === 'inline' ? 'inline' : 'attachment');

// Preserve structured SAP errors so Angular can show meaningful messages instead of generic 500s.
if (error.status && error.message) {
    return res.status(error.status).json({ success: false, message: error.message, data });
}
```

#### 11. Presentation Mode

1-minute: `portalController.js` is the bridge between Express routes and backend services for login, profile, leave, payslip, PDF download, and mail.

3-minute: It validates HTTP inputs, calls service methods, standardizes response format, signs JWT after SAP login, and handles structured SAP errors.

Deep technical: The controller deliberately avoids SAP URL construction details. Its improvement areas are stricter authorization, reduced logging of sensitive data, and avoiding raw SAP response exposure.

### `backend/services/sapService.js`

#### 1. File Overview

Purpose: Encapsulates all SAP OData communication, CSRF token handling, session cookies, field normalization, leave validation, analytics, and payslip PDF retrieval.

Why needed: SAP integration is the most volatile part of the portal. Isolating it prevents SAP-specific complexity from leaking into controllers and Angular.

Architecture role: SAP integration / service layer.

#### 2. Imports Analysis

- `axios`: HTTP client for SAP OData.
- `node:path`: imported but not currently used; can be removed unless future path logic is added.
- `leaveRequestDateStore`: persists submitted date overlays.
- `withdrawnLeaveStore`: persists withdrawn leave overlays.

Alternative to Axios: `fetch`, SAP Cloud SDK, or OData client libraries. Axios is straightforward for Basic Auth, responseType `arraybuffer`, and custom status handling.

#### 3. Class Analysis

No class. A module of pure-ish helper functions and exported service functions is enough because there is one SAP service configuration per process.

#### 4. Keyword Analysis

- `Object.freeze`: prevents accidental mutation of `ENTITY_SETS`.
- `new URL`: safely combines SAP host and service path.
- `let sessionCookies`: mutable because SAP can update cookies after CSRF/login calls.
- `async/await`: required for network sequence and readable error handling.
- `Promise.all`: fetches leave data, balance, and history in parallel for analytics.
- regex literals: parse OData date formats and entity keys.
- `Number.isFinite`, `Number.isNaN`: safer numeric validation than loose truthiness.

#### 5. Variable Analysis

- `SAP_URL`, `SAP_SERVICE_PATH`, `SAP_USER`, `SAP_PASSWORD`, `SAP_CLIENT`: backend-only environment values.
- `SAP_TIMEOUT_MS`: number timeout; protects API from hanging indefinitely.
- `DEFAULT_SERVICE_PATH`: fallback for the configured OData service.
- `SERVICE_NAME`, `SEGW_PROJECT`, `MPC_CLASS`, `DPC_EXT_CLASS`: documentation/analytics metadata to explain SAP Gateway implementation.
- `ENTITY_SETS`: central dictionary of SAP entity set names.
- `baseUrl`: final SAP OData root URL.
- `sessionCookies`: process-wide cookie string; simple session continuity.

#### 6. Function Analysis

- `getPernrVariants`: tries raw and 8-digit padded personnel number because SAP systems often store PERNR padded.
- `escapeODataValue`: doubles single quotes to avoid breaking OData filters/keys.
- `buildFilter`: creates `$filter` expressions while skipping empty values.
- `buildFilteredPath`: appends encoded `$filter` to an entity set.
- `normalizePernr`: standardizes employee ids to 8 digits.
- `isNetworkError`: separates no-response errors from SAP response errors.
- `toArray`: normalizes single objects or arrays.
- `normalizeStatus`: maps SAP statuses into UI-friendly values.
- `parseSapDate`, `formatSapDate`, `formatSapRequestDate`: handle SAP `/Date(...)`, `yyyyMMdd`, ISO, and display dates.
- `calculateDays`: inclusive leave day calculation.
- `createAxios`: builds SAP HTTP client with Basic Auth, SAP client param, CSRF header, cookies, timeout, and manual status validation.
- `updateSessionCookies`: stores SAP cookies after token/login/mutation responses.
- `fetchCsrfToken`: performs SAP service-root GET with `X-CSRF-Token: Fetch`.
- `unwrapODataResponse`: handles OData v2 `d.results`, `d`, and plain JSON.
- `handleSapError`: converts Axios/SAP errors into controller-friendly structured objects.
- `postLogin`: CSRF token fetch, login POST to `EmpLoginSet`, response unwrap.
- `fetchEmployeeProfile`: key-based profile read and frontend field mapping.
- `fetchLeaveData`, `fetchLeaveBalance`, `fetchLeaveHistory`, `fetchLeaveRequests`: filtered reads by PERNR.
- `createLeaveRequest`: validates, prevents overlaps, fetches CSRF, posts to SAP, records submitted overlay.
- `cancelLeaveRequest`: deletes/cancels SAP leave by request id.
- `withdrawLeaveRequest`: deletes SAP leave request by composite key and records withdrawn overlay.
- `fetchLeaveAnalytics`: parallel fetches plus grouped dashboard data.
- `validateLeaveRequest`: required field/date validation.
- `assertNoOverlappingLeave`: protects user and SAP from duplicate active leave ranges.
- `normalizeLeaveRecord`: maps SAP field variants into stable UI names.
- `applyLeaveRecordOverrides`: applies local submitted/withdrawn overlays.
- `groupLeaveByType`: builds analytics by leave type.
- `fetchPaySlipList`: fetches payslip list with optional month/year filters and PERNR variants.
- `downloadPayslipPdf`: reads SAP `$value` PDF by entity keys.
- `downloadPayslipPdfFromUrl`: supports legacy/direct SAP metadata URLs.
- `getAbsolutePdfUrl`: safely resolves relative or absolute PDF URLs.

#### 7. API / Backend / SAP Integration

SAP OData specifics:

- Reads use GET and generally do not need CSRF.
- Mutations use CSRF token and SAP cookies.
- PDF uses `$value` endpoint and `responseType: 'arraybuffer'`.
- SAP Basic Auth credentials are backend-only.
- SAP client is sent as `sap-client` query param when configured.

#### 8. Architecture Decisions

This file is intentionally the thickest service because SAP systems often return inconsistent field names and date formats. Normalizing here keeps Angular clean and makes portal reuse easier for Customer/Vendor/Maintenance/EHSM services.

#### 9. Reviewer Questions

- Beginner: What is an OData entity set?
- Intermediate: Why encode `$filter`?
- Senior: Is a global cookie jar safe for multiple users? It is simple but not ideal; per-request/session cookie storage is safer at scale.
- Why: Why use `Object.freeze` for `ENTITY_SETS`? To avoid accidental runtime mutation of SAP contract names.
- Trick: Does `validateStatus` make errors disappear? No, it lets code inspect SAP error responses manually.

#### 10. Paste-Ready Comments

```js
// SAP stores employee numbers as 8-digit PERNR values in many HR tables, so normalize before OData calls.
function normalizePernr(pernr) {
    return String(pernr ?? '').trim().padStart(8, '0');
}

// OData string literals escape single quotes by doubling them; this prevents malformed filters and keys.
function escapeODataValue(value) {
    return String(value ?? '').replace(/'/g, "''");
}

// Mutating SAP OData requests require a CSRF token and the cookies returned during token fetch.
async function fetchCsrfToken() {
    const client = createAxios({ customHeaders: { 'X-CSRF-Token': 'Fetch' } });
    const response = await client.get('');
    updateSessionCookies(response);
    return response.headers['x-csrf-token'] || response.headers['X-CSRF-Token'];
}
```

#### 11. Presentation Mode

1-minute: `sapService.js` is the SAP adapter. It knows entity sets, CSRF, cookies, OData filters, dates, statuses, and PDF `$value` downloads.

3-minute: It hides SAP complexity behind functions like `fetchEmployeeProfile`, `createLeaveRequest`, and `downloadPayslipPdf`, allowing controllers and Angular to work with normalized data.

Deep technical: Discuss cookie/session isolation, stronger OData query builders, SAP Cloud SDK alternatives, retry strategy, observability, and authorization based on JWT PERNR.

### `backend/services/mailService.js`

#### 1. File Overview

Purpose: Sends payslip PDF attachments through Gmail using Nodemailer.

Why needed: Email credentials must stay server-side; Angular should only request the backend to send mail.

Architecture role: Service layer / mail integration.

#### 2. Imports Analysis

- `nodemailer`: SMTP mail client. Removing it makes mail sending impossible.

Alternative: SendGrid, AWS SES, Microsoft Graph, SMTP relay.

#### 3. Class Analysis

No class. The service exposes one mail function and a config helper.

#### 4. Keyword Analysis

- `const DEFAULT_FROM`, `DEFAULT_TO`: fallback values only. In this project, `.env` should override them with `PAYSLIP_MAIL_FROM` and `PAYSLIP_MAIL_TO`.
- `process.env.PAYSLIP_MAIL_FROM || DEFAULT_FROM`: environment-first config.
- `async function sendPayslipMail`: mail is network I/O.
- `Buffer.from(pdfBuffer)`: ensures attachment content is binary buffer.

#### 5. Variable Analysis

- `user`: Gmail sender account; from env or fallback.
- `pass`: Gmail app password; must come from env.
- `to`: recipient address; from env or fallback.
- `transporter`: Nodemailer SMTP client for one send operation.
- `period`, `subject`: derived mail metadata.

#### 6. Function Analysis

- `getMailConfig`: reads env, validates app password, returns config.
- `sendPayslipMail`: creates transporter, builds subject/text/attachment, sends email.

Security: Gmail app password must not be committed or displayed. Rotate it if exposed.

#### 7. SAP Integration

No direct SAP call. Controller first downloads SAP PDF, then this service sends it.

#### 8. Architecture Decisions

Mail logic is separate from payslip controller so future portals can reuse the same mail pattern with different documents.

#### 9. Reviewer Questions

- Beginner: Why use an app password?
- Intermediate: Why is `from` set to `user`?
- Senior: Should transporter be reused? For high volume yes; for low portal use current approach is simple.
- Why: Why keep defaults if `.env` exists? For dev fallback, though production should fail loudly instead.
- Trick: Does `PAYSLIP_MAIL_TO` choose the logged-in employee email? No, it is a configured recipient unless changed.

#### 10. Paste-Ready Comments

```js
// Environment values override defaults so mail accounts can change without editing source code.
const user = process.env.PAYSLIP_MAIL_FROM || DEFAULT_FROM;

// Gmail requires an app password for SMTP when account security features are enabled.
const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD;
```

#### 11. Presentation Mode

1-minute: This service sends the payslip PDF as an email attachment using backend-only Gmail credentials.

3-minute: It reads sender/recipient/password from env, validates configuration, creates a Nodemailer transporter, and sends the SAP PDF buffer.

Deep technical: Discuss moving to enterprise SMTP/SES, dynamic employee recipients, audit logging, rate limiting, and removing hard-coded fallback emails.

### `backend/services/leaveRequestDateStore.js`

#### 1. File Overview

Purpose: Stores submitted leave request date overlays in `backend/data/leave-request-dates.json`.

Why needed: SAP may return date fields in different formats or not immediately reflect UI-submitted dates; this file preserves display consistency.

Architecture role: Backend utility service / local persistence overlay.

#### 2. Imports Analysis

- `node:fs`: reads/writes JSON.
- `node:path`: builds OS-safe path to data file.

Alternative: database table, Redis, SAP-only source of truth.

#### 3. Class Analysis

No class. A small file-store module is simpler.

#### 4. Keyword Analysis

- `try/catch`: prevents corrupt/missing JSON file from crashing the API.
- `fs.existsSync`: handles first run without a store file.
- `JSON.parse/stringify`: serializes records.
- `module.exports`: exposes `applySubmittedDates` and `markSubmitted`.

#### 5. Variable Analysis

- `storePath`: absolute path to JSON store.
- normalized fields: PERNR, leave type, dates, days, reason are used to build stable matching keys.

#### 6. Function Analysis

Normalizers standardize dates, employee ids, leave types, reasons, and days. `markSubmitted` upserts a submitted record. `applySubmittedDates` maps SAP records back to saved date values.

#### 7. SAP Integration

Used after SAP leave creation and during SAP leave reads to keep UI dates coherent.

#### 8. Architecture Decisions

This is a pragmatic local overlay, not the system of record. SAP remains source of truth.

#### 9. Reviewer Questions

- Beginner: Why pad PERNR?
- Intermediate: Why normalize the key?
- Senior: What happens in multi-instance deployment? Local JSON will diverge; use shared DB.
- Why: Why catch JSON read errors? To avoid one corrupt helper file taking down the portal.
- Trick: Is this an audit log? No, it is a UI consistency helper.

#### 10. Paste-Ready Comments

```js
// Build a stable comparison key because SAP can return equivalent leave data with different field names.
function submittedRecordKey(record) {
    return [normalizePernr(record.Pernr || record.pernr), normalizeLeaveType(record.Leavetype)].join('|');
}
```

#### 11. Presentation Mode

1-minute: This helper stores submitted leave dates locally so SAP response differences do not confuse the UI.

3-minute: It normalizes employee id, leave type, dates, days, and reason to match a newly submitted request with later SAP records.

Deep technical: For production, replace file storage with a database or remove it when SAP returns all required fields reliably.

### `backend/services/withdrawnLeaveStore.js`

#### 1. File Overview

Purpose: Stores withdrawn leave keys so records can be shown as `WITHDRAW REQUEST` even if SAP read results lag.

Architecture role: Backend utility service / local persistence overlay.

#### 2. Imports Analysis

- `node:fs`, `node:path`: read/write local JSON store.

#### 3. Class Analysis

No class; functional module is enough.

#### 4. Keyword Analysis

- object store keyed by `pernr|leaveType|beginDate`: gives O(1) lookup.
- `Boolean(...)`: converts lookup result to true/false.
- spread `...record`: preserves original SAP fields while overriding status.

#### 5. Variable Analysis

- `storePath`: JSON file path.
- key components: normalized PERNR, uppercase leave type, normalized begin date.

#### 6. Function Analysis

- `markWithdrawn`: persists withdrawn status by composite key.
- `isWithdrawn`: checks if record was withdrawn.
- `applyWithdrawnStatus(es)`: overlays status on SAP records.

#### 7. SAP Integration

Called after SAP DELETE withdrawal succeeds, then used while reading leave records.

#### 8. Architecture Decisions

Composite key mirrors SAP entity key design.

#### 9. Reviewer Questions

- Beginner: Why use composite key?
- Intermediate: Why uppercase leave type?
- Senior: How would this behave behind a load balancer? It requires shared persistence.
- Why: Why not delete local entry later? Could add reconciliation once SAP status is confirmed.
- Trick: Does this withdraw leave by itself? No, SAP DELETE does; store only reflects it.

#### 10. Paste-Ready Comments

```js
// Mirror the SAP leave request identity so local withdrawn status can be matched back to OData records.
function buildKey(pernr, leaveType, beginDate) {
    return [normalizePernr(pernr), String(leaveType ?? '').trim().toUpperCase(), normalizeDate(beginDate)].join('|');
}
```

#### 11. Presentation Mode

1-minute: It remembers successful withdrawals and overlays the withdrawn status on future records.

3-minute: It handles UI consistency when SAP deletion succeeds but later reads do not immediately show a withdrawn status.

Deep technical: For scalable production, replace local JSON with centralized persistence or SAP workflow status.

### `backend/utils/pdfUtil.js`

#### 1. File Overview

Purpose: Applies HTTP headers for PDF responses.

Architecture role: Utility.

#### 2. Imports Analysis

No imports needed.

#### 3. Class Analysis

No class; one utility function is enough.

#### 4. Keyword Analysis

- default parameters: `filename = 'document.pdf'`, `disposition = 'attachment'`.
- object literal passed to `res.set`.
- template literal builds content disposition.

#### 5. Variable Analysis

- `res`: Express response object.
- `filename`: output file name.
- `disposition`: browser behavior, `attachment` or `inline`.

#### 6. Function Analysis

`setPdfHeaders` sets:

- `Content-Type: application/pdf`
- `Content-Disposition`: download or inline preview
- `Cache-Control`: prevents stale payslip caching

#### 7. SAP Integration

Used after SAP PDF bytes are downloaded.

#### 8. Architecture Decisions

Centralizing headers avoids inconsistent PDF behavior across endpoints.

#### 9. Reviewer Questions

- Beginner: What is `Content-Type`?
- Intermediate: Difference between `inline` and `attachment`?
- Senior: Should payslips be cached? Usually no, because payroll documents are sensitive.
- Why: Why utility file? Reuse and consistency.
- Trick: Does this generate a PDF? No, it only sets headers for an existing PDF buffer.

#### 10. Paste-Ready Comments

```js
// Payslips contain sensitive payroll data, so prevent browser/proxy caching of PDF responses.
'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
```

#### 11. Presentation Mode

1-minute: This utility tells the browser how to handle a payslip PDF response.

3-minute: It supports both download and inline preview while preventing cache storage of sensitive payroll PDFs.

Deep technical: Add `Pragma`, `Expires`, and stricter filename encoding for older browsers and special characters.

## Frontend File-by-File Review

### `frontend/src/main.ts`

Purpose: Angular application entry point. It bootstraps the root `App` component with `appConfig`.

Why needed: Browser starts Angular here.

Imports: `bootstrapApplication` starts standalone Angular apps; `App` is root component; `appConfig` provides router/http/animations/charts.

Reviewer questions: Why standalone bootstrap instead of `AppModule`? Angular modern standalone architecture reduces module boilerplate.

Paste-ready comment:

```ts
// Bootstrap the standalone Angular application with global providers from app.config.ts.
bootstrapApplication(App, appConfig);
```

### `frontend/src/app/app.config.ts`

Purpose: Registers app-wide Angular providers.

Imports:

- `ApplicationConfig`: type for global config.
- `provideBrowserGlobalErrorListeners`: browser error handling.
- `provideZoneChangeDetection`: configures zone behavior; `eventCoalescing` reduces excessive change detection from many DOM events.
- `provideHttpClient`, `withInterceptors`: enables HTTP and attaches auth interceptor.
- `provideRouter`: registers routes.
- `provideAnimations`: required by Angular Material animations/dialog/snackbar.
- `provideCharts`, `withDefaultRegisterables`: registers Chart.js components for `ng2-charts`.
- `routes`, `authInterceptor`: local route and auth configuration.

Why decisions: Global providers belong in config so components stay focused on UI.

Reviewer questions:

- Why use `withInterceptors([authInterceptor])`? To add JWT consistently to HTTP calls.
- What happens if `provideAnimations` is removed? Material dialogs/snackbars may lose expected behavior.

### `frontend/src/app/app.routes.ts`

Purpose: Defines page navigation and lazy-loaded standalone components.

Imports:

- `Routes`: route typing.
- `authGuard`: protects dashboard/profile/leave/payslip.
- `guestGuard`: prevents logged-in users from returning to login.

Design: `loadComponent` lazy-loads each feature to reduce initial bundle. Shell route wraps authenticated child pages.

Reviewer questions:

- Why wildcard routes? To redirect unknown URLs safely.
- Why `pathMatch: 'full'` on empty route? Prevents partial matching from hijacking child routes.

### `frontend/src/app/app.ts`

Purpose: Root Angular component hosting `RouterOutlet`, dialog/snackbar modules, and theme state.

Imports: `Component`, `inject`, `RouterOutlet`, Material dialog/snackbar modules, `ThemeService`.

Class analysis: `App` is minimal because layout is handled by `AppShellComponent`.

Keywords:

- `@Component`: Angular metadata.
- `imports`: standalone component dependencies.
- `private readonly`: injected service should not be reassigned or exposed.
- `protected readonly`: template can read dark mode without making it public API.

Reviewer question: Why is there no business logic here? Root component should compose app-level dependencies only.

### `frontend/src/app/core/models/portal.models.ts`

Purpose: Central TypeScript contracts for API responses, user session, profile, leave, analytics, payslip, and notifications.

Why interfaces: Data comes as JSON from backend/SAP. Interfaces provide compile-time checks without runtime class overhead.

Key variables/types:

- `ApiResponse<T>`: generic backend response wrapper.
- `PortalUser`, `AuthSession`, `LoginPayload`: authentication contract.
- `Profile`: normalized employee master data.
- `LeaveRecord`: normalized leave row with `raw` SAP payload.
- `PayslipRecord`: normalized payroll row.
- `NotificationItem`: snackbar/notification model.

Reviewer questions:

- Why keep `raw`? To preserve SAP fields for detailed dialogs/debugging while exposing normalized fields for UI.
- Why optional nullable fields? SAP may omit fields or send placeholder values.

### `frontend/src/app/core/services/auth.service.ts`

Purpose: Owns login/logout/session persistence and exposes authenticated user state.

Imports:

- Angular `Injectable`, `computed`, `inject`, `signal`.
- `Router` for navigation after logout.
- RxJS `tap` for side effects after login.
- models and services.

Class responsibility: Authentication facade for the Angular app.

Keywords:

- `@Injectable({ providedIn: 'root' })`: singleton app-wide service.
- `signal<AuthSession | null>`: current session state.
- `computed`: derived token/user/employee id values.
- `private`: hides storage and normalization helpers.
- `void this.router.navigate`: intentionally ignores navigation Promise result.

Function analysis:

- `login`: calls backend, normalizes PERNR, updates signal and localStorage.
- `logout`: clears session, optionally shows notice, navigates to login.
- `expireSession`: used by interceptor on 401.
- `consumeSessionExpiredFlag`: one-time dialog flag.
- `readSession`: restores persisted session safely.
- `normalizeSession`: pads PERNR to SAP format.

Reviewer questions:

- Why localStorage? Keeps login across refresh; tradeoff is XSS exposure.
- Senior: Would HttpOnly cookies be safer? Yes for production-grade auth.

### `frontend/src/app/core/services/portal.service.ts`

Purpose: Central frontend API adapter. It calls backend endpoints and maps backend/SAP-shaped payloads into UI models.

Imports:

- `HttpClient`, `HttpHeaders`, `HttpParams`: API calls and query params.
- Angular DI.
- RxJS `Observable`, `of`.
- RxJS operators for mapping, caching, errors, logging, replay.
- `environment`: backend API URL.
- portal models.

Class responsibility: One service for all portal data operations.

Important design decisions:

- `jsonOptions` adds Accept header and `$format=json`.
- profile caching avoids duplicate SAP profile calls.
- `readSingle` and `readEntitySet` support both normalized backend responses and raw OData responses.
- mapper methods tolerate SAP field-name variations such as `Pernr`, `PERNR`, `Awart`, `Leavetype`, `KTEXT`.
- `downloadPayslip` uses `responseType: 'blob'` for PDFs.

Function analysis:

- `login`: posts credentials and extracts session.
- `getProfile`: uses cache and `shareReplay`.
- `getLeave*`: fetches and maps leave records.
- `create/cancel/withdrawLeaveRequest`: mutating leave calls.
- `getPayslips`: filters month/year.
- `downloadPayslip`: retrieves PDF blob.
- `mailPayslip`: asks backend to mail selected statement.
- private mappers/readers: normalize strings, numbers, dates, nested metadata, statuses, payslip entity keys.

Reviewer questions:

- Why not let components parse SAP fields? Central mapping prevents duplicated fragile parsing.
- Why `shareReplay`? Multiple subscribers share one profile HTTP request.
- Trick: Is `private` runtime security? No, TypeScript privacy is compile-time.

### `frontend/src/app/core/services/notification.service.ts`

Purpose: Central snackbar and notification list service.

Design: Signals store the latest notifications; Angular Material snackbar shows immediate feedback.

Keywords: `signal`, `computed`, `crypto.randomUUID`, array slicing to keep only latest 8 notifications.

Reviewer question: Why centralize notifications? Consistent UX across login, leave, payslip, and shell.

### `frontend/src/app/core/services/theme.service.ts`

Purpose: Manages dark/light theme state and applies body CSS classes.

Imports: `DOCUMENT`, `Renderer2`, `RendererFactory2`, `effect`, `signal`.

Why Renderer2: Angular-safe DOM manipulation abstraction.

Why `effect`: automatically applies body class and persists localStorage whenever theme signal changes.

Reviewer question: Why not directly use `document.body.classList`? Renderer2 is more Angular-platform friendly.

### `frontend/src/app/core/services/session-dialog.service.ts`

Purpose: Opens a single session-expired dialog when authentication fails.

Design: `isOpen` prevents duplicate dialogs.

Reviewer question: Why service instead of opening dialog in guard directly? It centralizes dialog state and avoids repeated logic.

### `frontend/src/app/core/interceptors/auth.interceptor.ts`

Purpose: Adds JWT bearer token to API requests and handles 401 errors.

Imports: HTTP error/interceptor types, DI, Router, RxJS `catchError`/`throwError`, auth/notification services.

Logic:

1. Read current token.
2. Clone request with `Authorization` header if token exists.
3. Pass request to next handler.
4. On 401 except login, expire session, notify, navigate to login.

Reviewer questions:

- Why clone request? Angular `HttpRequest` is immutable.
- Why skip `/login` 401 handling? Login failure should show login error, not session-expired flow.

### `frontend/src/app/core/guards/auth.guard.ts`

Purpose: Protects authenticated routes.

Logic: If authenticated, allow. Otherwise optionally show expired dialog and return login `UrlTree`.

Reviewer question: Why return `UrlTree` instead of `router.navigate`? Guards should return navigation decisions declaratively.

### `frontend/src/app/core/guards/guest.guard.ts`

Purpose: Prevents authenticated users from accessing login page.

Logic: Authenticated users redirect to dashboard; guests can proceed.

### `frontend/src/app/core/dialogs/session-expired-dialog.component.ts`

Purpose: Material dialog shown when session expires.

Design: Inline template is acceptable because dialog UI is very small.

Reviewer question: Why `disableClose` in service? Session expiry requires explicit return to login.

### `frontend/src/app/core/layout/app-shell.component.ts`

Purpose: Authenticated application shell with toolbar, sidenav, notifications, profile header, theme toggle, and logout.

Imports:

- Angular common/lifecycle/signals.
- CDK `BreakpointObserver` for responsive layout.
- Router directives and Material modules.
- Auth, portal, notification, theme services.

Class responsibility: Layout orchestration, not feature business logic.

Important decisions:

- `OnPush` improves performance for dashboard-style UI.
- `BreakpointObserver` switches sidenav mode at desktop width.
- `ResizeObserver` computes snackbar top offset from toolbar height.
- `NgZone.runOutsideAngular` avoids resize events triggering unnecessary change detection.
- `@ViewChild` gets toolbar DOM element after view init.

Reviewer questions:

- Why shell route? Shared navigation should not be duplicated in every feature page.
- Senior: Why disconnect `ResizeObserver`? Prevents memory leaks.

### `frontend/src/app/features/login/login.component.ts`

Purpose: Employee login screen.

Imports: Reactive forms, validators, router, Material modules, auth/notification/theme services.

Design:

- `fb.nonNullable.group`: form controls produce strings, not nullable values.
- `Validators.required`: prevents empty SAP login requests.
- `isSubmitting` signal prevents double submit.
- `showPassword` signal controls password visibility.

Reviewer questions:

- Why reactive forms? Stronger structure and validation than template-only forms for login.
- Senior: Why are there debug logs? Useful in development; remove or reduce in production.

### `frontend/src/app/features/dashboard/dashboard.component.ts`

Purpose: Dashboard with leave KPIs, payslip summaries, charts, and filters.

Imports: Common/forms/material, Chart.js types, RxJS `forkJoin`, shared chart/KPI components, services/models.

Design:

- Fetches leave history and requests in parallel.
- Groups payslip wage lines into monthly statements.
- Uses computed signals for filters and chart datasets.
- Chart configuration is local because it is dashboard-specific.

Reviewer questions:

- Why computed for charts? Chart data is derived from records and filters.
- Why `forkJoin`? Leave dashboard needs both history and requests before merging.
- Senior: Why is finance aging based on current date? It is a dashboard visualization choice; payroll aging logic should be reviewed for business correctness.

### `frontend/src/app/features/leave/leave.component.ts`

Purpose: Full leave management page: requests/history tabs, filters, pagination, leave submission, cancellation, withdrawal, export to Excel/PDF.

Design:

- `LeaveDatasetKey` union restricts tabs to `requests` or `history`.
- Signals hold UI state.
- Computed values derive filtered records, summaries, page counts, leave type options, and request days.
- Backend and local overlap checks protect against duplicate leave ranges.
- LocalStorage tracks withdrawn request keys per PERNR for immediate UI status.

Function highlights:

- `loadLeaveData`: loads request/history sections.
- `submitLeaveRequest`: validates form, checks overlap, calls backend.
- `withdrawLeave`: confirms, builds SAP key, calls backend.
- `exportAllToExcel/Pdf`: client-side exports.
- `formatDisplayDate`: supports SAP date formats.
- `hasLocalOverlap`: prevents active overlapping leave.

Reviewer questions:

- Why both frontend and backend overlap checks? Frontend gives immediate UX; backend enforces rule before SAP mutation.
- Senior: Is `window.confirm` ideal? It works, but Material dialog would be more consistent.
- Trick: Is client-side overlap enough? No, backend must validate too.

### `frontend/src/app/features/leave/leave-details-dialog.component.ts`

Purpose: Dialog showing one leave record in detail with export options.

Design:

- Receives data through `MAT_DIALOG_DATA`.
- Uses `MatDialogRef` to close itself.
- `escapeHtml` protects generated export HTML from injected values.

Reviewer questions:

- Why escape HTML? Export windows are built from strings; escaping prevents data from becoming markup/script.
- Why `DatePipe` instantiated in method? Simple formatting; could inject/reuse for performance if needed.

### `frontend/src/app/features/payslip/payslip.component.ts`

Purpose: Payslip list and statement view with download, print, preview, and mail actions.

Design:

- Groups SAP wage lines by employee/year/month into `PayslipStatementView`.
- Uses Blob URLs for PDF download/preview/print.
- Masks bank account before display.
- Revokes object URLs to avoid memory leaks.

Reviewer questions:

- Why group records? SAP payslip often returns multiple wage lines for one month.
- Why `responseType: blob`? PDF is binary, not JSON.
- Senior: Should recipient email be hardcoded in notification text? No, it should come from backend response/config.

### `frontend/src/app/features/payslip/payslip-details-dialog.component.ts`

Purpose: Detailed payslip statement dialog with PDF actions.

Design:

- Exports `PayslipStatementView` because parent component uses it.
- Uses `computed` for masked bank account.
- Injects services with `inject()` and dialog data with constructor `@Inject`.
- Opens/prints/downloads backend PDF blobs.

Reviewer questions:

- Why `SafeResourceUrl` not used here? This component opens blobs through anchors/iframe; the separate PDF viewer handles sanitized embedding.
- Senior: Why revoke object URLs after 60 seconds? Allows browser time to open/print/download before cleanup.

### `frontend/src/app/features/profile/profile.component.ts`

Purpose: Employee profile page.

Design:

- Loads profile by authenticated PERNR.
- Displays normalized fields through `detailItems`.
- Removes leading zeroes for user-friendly personnel number display.

Reviewer questions:

- Why not call SAP from component? `PortalService` centralizes API mapping and caching.

### `frontend/src/app/shared/components/kpi-card/kpi-card.component.ts`

Purpose: Reusable KPI display card.

Design:

- Signal inputs make the component strongly typed and reusable.
- `accent` union restricts visual variants to known values.

Reviewer questions:

- Why shared component? Dashboard/profile/leave can reuse consistent KPI presentation.

### `frontend/src/app/shared/components/chart/chart.component.ts`

Purpose: Reusable Chart.js wrapper.

Design:

- Accepts chart type/data/options as inputs.
- `hasData` getter prevents empty chart rendering.
- `BaseChartDirective` from `ng2-charts` connects Angular to Chart.js.

Reviewer questions:

- Why not build canvas manually? Chart.js handles rendering, axes, legends, responsiveness.

### `frontend/src/app/shared/components/pdf-viewer/pdf-viewer.component.ts`

Purpose: Safe PDF iframe/embed wrapper.

Imports:

- `DomSanitizer`, `SafeResourceUrl`: required because Angular blocks unsafe resource URLs by default.
- `SecurityContext`: allows sanitized text inspection.

Security note: `bypassSecurityTrustResourceUrl` should only be used for trusted Blob/backend PDF URLs, not arbitrary user input.

Reviewer questions:

- Why sanitize PDF URL? Angular protects against unsafe resource injection.
- Trick: Does bypassing sanitizer make any URL safe? No, it tells Angular you trust it; developer must ensure trust.

### HTML / SCSS Files

Purpose: Templates define Angular bindings, Material components, tables, forms, dialogs, and action buttons. SCSS files define layout, responsive behavior, theme surfaces, status chips, cards, and portal visual identity.

Architecture role: UI layer.

Reviewer focus:

- Templates should be thin: bind to signals/computed values and call component methods.
- SCSS should not contain business logic.
- Status classes come from TS methods so SAP statuses remain normalized before styling.
- Responsive shell and tables are separated by feature to avoid global CSS conflicts.

### Config Files

- `package.json` root: workspace scripts for backend/frontend.
- `backend/package.json`: Express/Axios/JWT/Nodemailer dependencies and backend scripts.
- `frontend/package.json`: Angular/Material/Chart/RxJS dependencies.
- `frontend/angular.json`: Angular CLI build/test/style configuration.
- `frontend/proxy.conf.json`: dev proxy for API calls when using Angular dev server.
- `tsconfig*.json`: TypeScript compiler settings.
- `.env.example`: safe template for required backend env variables.
- `.gitignore`: prevents dependencies/build/private files from being committed.

Do not document real `.env` secret values in README. Use `.env.example` only.

## End-to-End Request Flows

### Login Flow

1. `LoginComponent.submit()`
2. `AuthService.login()`
3. `PortalService.login()`
4. `POST /api/login`
5. `portalController.login`
6. `sapService.postLogin`
7. SAP `EmpLoginSet`
8. JWT returned to Angular
9. `authInterceptor` uses token on later requests

### Leave Creation Flow

1. `LeaveComponent.submitLeaveRequest`
2. Frontend validates required fields and local overlap.
3. `PortalService.createLeaveRequest`
4. `POST /api/leave/request`
5. `sapService.createLeaveRequest`
6. Backend validates and checks overlap against SAP records.
7. CSRF token fetched.
8. SAP `LeaveRequestNewSet` POST.
9. Submitted date overlay stored.
10. Angular refreshes request list.

### Payslip Download Flow

1. `PayslipComponent.downloadPdf` or dialog action.
2. `PortalService.downloadPayslip`
3. `GET /api/payslip/download`
4. `portalController.downloadPayslip`
5. `sapService.downloadPayslipPdf`
6. SAP `PaySlipPdfSet(...)/$value`
7. `setPdfHeaders`
8. Browser downloads or previews PDF blob.

### Payslip Mail Flow

1. Angular calls `mailPayslip`.
2. Backend downloads SAP PDF.
3. `mailService.sendPayslipMail` attaches PDF.
4. Nodemailer sends via Gmail app password.
5. Backend returns `messageId`.

## Security Review Points

- Backend `.env` contains sensitive SAP and mail credentials. Never commit real values.
- Rotate any Gmail app password that has been exposed in chat, screenshots, commits, or shared folders.
- JWT fallback secret is development-only.
- Add PERNR authorization checks so route `:id` must match `req.user.pernr`, unless admin role exists.
- Remove or reduce console logs containing usernames, SAP responses, or payroll/leave data before production.
- Consider HttpOnly secure cookies instead of localStorage for production authentication.
- Add rate limiting to login and mail endpoints.
- Restrict CORS to the frontend origin in production.
- Consider replacing local JSON stores with database/shared persistence for multi-instance deployment.

## Performance Review Points

- Angular `OnPush`, signals, and computed values reduce unnecessary UI recalculation.
- `shareReplay` prevents duplicate profile requests.
- Dashboard uses `forkJoin` to load independent SAP datasets concurrently.
- Backend `SAP_TIMEOUT_MS` prevents indefinitely hanging SAP calls.
- PDF buffers are held in memory; very large PDFs or high concurrency may need streaming.
- Local JSON file reads are simple but not optimal for high traffic.
- Chart data is derived client-side; acceptable for small employee datasets, but aggregate server-side for large datasets.

## Maintainability Review Points

- Routes define HTTP contract.
- Controllers define request validation/response shape.
- Services define SAP/mail/file-store logic.
- Models define frontend contracts.
- Shared components prevent duplicate KPI/chart/PDF UI.
- SAP field mapping is centralized in `PortalService` and `sapService`, reducing template complexity.

## Scalability Review Points

- Current backend is suitable for a local/single-instance portal.
- For production, move local stores to DB, isolate SAP cookies per user/session, add structured logging, monitoring, retry/backoff, and queue mail sending.
- Use role-based authorization if the portal expands to HR/admin scenarios.
- For Customer/Vendor/Maintenance/EHSM portals, keep the same layer pattern but create domain-specific services and models instead of mixing all domains in one service.

## Reviewer Question Bank

### Beginner

- What is the difference between frontend and backend in this portal?
- Why do we need `express.json()`?
- What does `@Component` do?
- What is an Angular service?
- What is an SAP OData entity set?
- Why is payslip downloaded as a Blob?

### Intermediate

- Why do we normalize PERNR to 8 digits?
- Why use guards and interceptors?
- Why use `OnPush` change detection?
- Why use CSRF token for SAP POST/DELETE?
- Why use `Object.freeze` for entity sets?
- Why keep `raw` SAP data inside normalized models?

### Senior

- How would you prevent one employee from accessing another employee's data?
- How would you redesign SAP session cookie handling for concurrent users?
- What breaks in multi-instance deployment?
- How would you audit leave withdrawal and payslip mail actions?
- How would you replace localStorage auth with secure cookie auth?
- How would you build a shared portal framework for Customer, Vendor, Maintenance, EHSM, and Employee portals?

### Why Questions

- Why not call SAP directly from Angular?
- Why split controller and service?
- Why use interfaces instead of classes for models?
- Why use standalone Angular components?
- Why use a backend mail service?
- Why centralize API mapping in `PortalService`?

### Trick Questions

- Does CORS secure the API? No.
- Does JWT encrypt the payload? No, it signs it.
- Does TypeScript `private` protect data at runtime? Not fully; it is mainly compile-time.
- Does `bypassSecurityTrustResourceUrl` sanitize arbitrary URLs? No, it marks a URL as trusted.
- Is frontend validation enough for leave overlap? No, backend validation is required.
- Does `Content-Disposition` create a PDF? No, it only tells the browser how to handle PDF bytes.

## Production-Quality Comment Blocks

### Backend Controller Comment Block

```js
// Controllers keep HTTP concerns separate from SAP implementation details.
// They validate request input, call domain services, and return a stable API shape to Angular.
```

### SAP Service Comment Block

```js
// SAP OData responses can vary by entity set and ABAP implementation.
// Normalize dates, statuses, PERNR values, and field aliases here so Angular receives stable data.
```

### Angular Service Comment Block

```ts
// PortalService is the frontend API adapter.
// Components call business-friendly methods while this service handles backend URLs and response mapping.
```

### Auth Interceptor Comment Block

```ts
// Clone the immutable Angular request and attach the JWT for protected backend routes.
// A 401 response means the portal session is no longer valid, so clear local state and return to login.
```

### Component Signal Comment Block

```ts
// Signals hold local UI state; computed values derive filtered records and totals without manual synchronization.
```

## Interview Presentation Scripts

### 1-Minute Explanation

This is an SAP Employee Portal built with Angular and Node.js. Angular provides login, dashboard, leave, profile, and payslip screens. Express acts as middleware between Angular and SAP OData, so SAP credentials stay server-side. The backend validates requests, calls SAP entity sets, normalizes responses, streams payslip PDFs, sends payslip mail, and protects routes with JWT. The same layered design can be reused for Customer, Vendor, Maintenance, and EHSM portals.

### 3-Minute Explanation

The application is split into frontend and backend. The frontend is a standalone Angular app using Material UI, signals for state, guards for route protection, and an interceptor to attach JWT tokens. `PortalService` is the main frontend API adapter and maps backend/SAP responses into TypeScript models.

The backend is Express. `server.js` starts the app, `routes/api.js` defines protected portal routes, controllers validate requests and shape responses, and `sapService.js` handles all SAP OData details such as Basic Auth, CSRF token fetch, cookies, entity sets, filters, date parsing, status normalization, and PDF `$value` downloads. Payslip mail is isolated in `mailService.js`, and PDF headers are isolated in `pdfUtil.js`.

The key design reason is separation of concerns. Angular does not know SAP credentials or OData complexity. Controllers do not know detailed SAP parsing. Services hide integration complexity. Models define stable contracts for the UI.

### Deep Technical Explanation

In a senior review, I would explain this as a portal middleware architecture. The browser cannot safely hold SAP credentials, so the Express backend becomes a controlled integration boundary. Login is verified through SAP, then the backend signs a JWT containing the employee number. Angular stores the session and sends the JWT through an interceptor. Protected backend routes verify the JWT before calling SAP.

SAP integration is centralized because OData v2 responses can arrive as `d`, `d.results`, binary `$value`, or error payloads. Dates can be `/Date(...)`, `yyyyMMdd`, ISO strings, or display strings. HR fields often have ABAP names like `Pernr`, `Awart`, `Begda`, `Endda`, `Kverb`, or custom Gateway names. The service layer normalizes those variations so UI components can work with stable models like `LeaveRecord`, `Profile`, and `PayslipRecord`.

For maintainability, route definitions, controller logic, SAP integration, mail integration, frontend services, guards, components, and shared UI are separated by responsibility. For performance, Angular uses `OnPush`, signals, computed values, lazy-loaded routes, and shared HTTP calls. For security, secrets stay backend-side, JWT protects APIs, PDF responses disable caching, and mail sending is server-side. For production, I would strengthen per-user authorization, replace local JSON overlays with shared persistence, isolate SAP cookies per user/session, remove debug logs, restrict CORS, add rate limiting, and move secrets to a managed secret store.
