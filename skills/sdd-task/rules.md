# sdd-task Rules

## R1：生命周期约束

- 必须在 `designed` 状态启动，输出推进到 `tasked`

## R2：任务一致性

- tasks.md 的每个任务必须能追溯到 design.md §2/§3 中的修改点
- 不允许凭空增加不在 design.md 范围内的任务

## R3：无实现代码

- 本阶段只拆任务，不允许修改 implementation/ 代码
- 实现代码由 sdd-dev 阶段执行

## R4：状态推进约束

- patchStatus(tasked) 前 validateTransition(designed, tasked)
