# PDash — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-05-29  
**Status:** Current

---

## Index

This document holds the product-wide sections; each product area lives in its own file under [`docs/prd/`](docs/prd/). Section numbers are stable and are **not** renumbered when a section moves — §12 (Data Model) and §14 (Design System) were removed on 2026-10-09 because they duplicated `ARCHITECTURE.md` §5 and `css/tokens.css`, so those two numbers are unused. Use the table to resolve any in-text "see §N" reference to the file that carries it.

| Sections | Area | File |
|---|---|---|
| §1, §2, §3, §13 | Overview, users, navigation, non-functional requirements | this file |
| §4 | Pipeline board and offer editor | [docs/prd/pipeline.md](docs/prd/pipeline.md) |
| §5 | Resource planning | [docs/prd/planning.md](docs/prd/planning.md) |
| §6 | Project reporting and the Program Dashboard | [docs/prd/reporting.md](docs/prd/reporting.md) |
| §7.1 | Project configuration form | [docs/prd/project-config.md](docs/prd/project-config.md) |
| §7, §7.2–§7.7 | Master Data: clients, client groups, pipelines & POTs, roles, currencies | [docs/prd/master-data.md](docs/prd/master-data.md) |
| §8 | Excel timesheet upload | [docs/prd/timesheets.md](docs/prd/timesheets.md) |
| §9, §10, §11 | Settings, notifications, Team assistant | [docs/prd/notifications.md](docs/prd/notifications.md) |
| §16 | User administration, Team, attribute lists, profile processing | [docs/prd/administration.md](docs/prd/administration.md) |
| §15, §17, §18 | Authentication, GDPR & data rights, sharing & permissions | [docs/prd/access.md](docs/prd/access.md) |

---

## 1. Product Overview

PDash is a multi-user web application for project portfolio management. It is designed for consulting and professional services teams who need to track commercial offers, plan resources, and monitor budget consumption across multiple projects.

The app is backed by a Node.js/Express REST API and a PostgreSQL database, with JWT-based authentication and role-based access control — three account roles (sysadmin/admin/user, sysadmin added 2026-09) plus per-resource sharing permissions (owner/editor/viewer) govern what each user can see and do (see §15–18). The frontend is Vanilla JS with no build step; each view is a separate HTML page.

---

## 2. Users and Context

**Primary user:** Project Manager / Portfolio Manager at a professional services firm.

**Context:** The user manages a portfolio of consulting projects. Each project is associated with a commercial offer (Cost Grid) built from estimated effort per role. Actuals come from a weekly Excel timesheet export. The user wants to see, at a glance, where each offer sits in the sales pipeline and how each active project is tracking against budget.

---

## 3. Views and Navigation

The application has three primary views accessible from the main navigation.

**Navigation (2026-10-02, replaces the former top navbar and footer):** on screens at least 1024px wide a **left sidebar** is shown, open by default and collapsible to a narrow icon rail with a button at the top; the choice is remembered across pages and visits. The sidebar lists the three views, then — for admins and sysadmins — an **ADMIN** section and — for sysadmins only — a **SYSADMIN** section, always expanded (no dropdowns); the current page is highlighted with a magenta marker. At its bottom it shows the user's initials and email (opening the account menu: My Profile, Settings, Send Notification, Change password, Sign out), the notification bell, and a "© 2026 PDash" line (open sidebar only). In the collapsed icon rail, hovering (or tabbing to) an icon, the initials or the bell shows a small dark tooltip to the right of the rail with its name (the user's email for the initials, "Notifications" for the bell); with the sidebar open, and on narrow screens, the browser's standard tooltip is used instead. On narrower screens (phones, portrait tablets) the navigation becomes a dark top bar with icons only: logo, bell and initials on the right, an icon per view, and one icon (with a small dot) for each of Admin and Sysadmin, which opens a full-width panel listing their pages. The breadcrumb is shown only on wide screens, and there is no footer anywhere in the application. A page's menu name, browser-tab title and breadcrumb are the same.

| Menu entry | View |
|---|---|
| Pipeline | Kanban board of cost grid offers organised by deal stage |
| Portfolio | Portfolio budget overview — estimated vs. spent (described in §6 "Project Reporting"; formerly named Project Reporting in the menu) |
| Planning | Cross-project hours distribution by role, project or owner (described in §5 "Resource Planning"; formerly named Resource Planning in the menu) |

Admin section entries: **Master Data** (the Config page, formerly "Config"), **Timesheets** (formerly "Actuals Repository"), **User Admin**, **Team**, **Attribute Lists**. Sysadmin section entries: **DB Reset**, **Terms & Conditions**.

Some pages have no menu entry at all and are reached only in context from the page that owns them — the project configuration form and the **Program Dashboard** (§6.1a) from the Portfolio, the profile-processing console from Timesheets.

**Default view on load:** Pipeline.

---

## 13. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| Runtime | Docker Compose (nginx + Node.js/Express + PostgreSQL); no frontend build step |
| Persistence | PostgreSQL (source of truth); in-memory JS cache seeded from the API on each page load — localStorage holds only client-side settings, not server data |
| Auth | JWT in httpOnly cookie; 401 → redirect to login |
| Dependencies (frontend) | Bootstrap 5.3.2 (CDN), Chart.js, SheetJS (XLS parsing) |
| Dependencies (backend) | Express, pg, bcryptjs, jsonwebtoken, nodemailer, multer, xlsx |
| Language | All UI text, alerts, and labels must be in English |
| Design tokens | All colours and type sizes must reference CSS custom properties in `css/tokens.css` — no hardcoded hex values in JS or CSS |

---

