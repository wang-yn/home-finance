# AGENTS.md

本文件定义 Home Finance 仓库中的 agent 工作约定。适用于整个仓库。

## 项目背景

Home Finance 是一个多人共同记录和分析家庭财务支出的应用。

技术栈：

- 前端：React + TypeScript + Vite
- 客户端壳：Tauri 2，面向桌面和 Android
- 后端：Go + Gin HTTP API
- 数据库：SQLite

主要目录：

- `apps/desktop`: React/Tauri 客户端
- `services/api`: Go API 和 SQLite 数据访问
- `docs`: 项目文档

## 工作原则

- 优先保持实现简单、可读、可测试。
- 优先复用现有结构和工具，不为小需求引入新依赖。
- 修改应聚焦当前任务，不做无关重构。
- 生成文件、依赖目录、构建产物不提交。
- 不确定业务含义时，先通过代码和文档确认；仍不明确再询问。

## 单元测试优先

- 新功能、缺陷修复和重构默认先补单元测试，再实现代码。
- 若已有行为缺少覆盖，先用测试锁定当前行为，再修改实现。
- 前端优先覆盖业务逻辑、数据转换和组件关键交互。
- 后端优先覆盖路由处理、参数校验、数据访问和边界条件。
- 无法补测试时，需要在最终说明或提交正文中写明原因和替代验证方式。

## 验证要求

根据改动范围选择最小但充分的验证：

- 前端改动：在 `apps/desktop` 运行 `npm run lint`，必要时运行 `npm run build`。
- 后端改动：在 `services/api` 运行 `go test ./...`。
- Tauri/Rust 改动：在 `apps/desktop/src-tauri` 运行 `cargo check`。

当前 Linux 环境运行 Tauri 检查可能需要系统依赖 `libdbus-1-dev` 和 `pkg-config`。如果缺失，应明确记录验证缺口。

## 提交规范

代码提交使用 Lora 规范，提交消息使用中文。

推荐格式：

```text
<类型>(<范围>): <中文描述>

<可选正文：说明为什么修改、影响范围、验证方式>
```

常用类型：

- `feat`: 新增功能
- `fix`: 修复缺陷
- `docs`: 文档变更
- `test`: 测试变更
- `refactor`: 不改变行为的重构
- `chore`: 构建、依赖、工具或仓库维护

示例：

```text
docs(规范): 补充 agent 工作约定
```
