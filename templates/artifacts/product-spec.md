# Spec：<规则域标题>

> 用途：product/specs/ 的正式文件格式（已确认产品规则）。
> 晋升机制：① Agent 在 converge 阶段将 SPEC 草稿写入 convergence.md 的「Spec 晋升候选」节；② 人工评审通过后，按本模板落盘到 `product/specs/<feature-domain>.md`。Agent 不得绕过评审直接写入 specs/。
> 组织约定：按 L2 Feature 域一个文件（如 `订单能力.md`、`账户能力.md`），同类规则追加进同一文件。

---
title: <规则域标题，如：订单能力规则>
source-chg: CHG-XXXX
promoted-at: <ISO8601 人工评审通过时间>
status: approved
feature: <L2 Feature ID 或业务域名>
tags: [<业务域标签>]
---

# <规则域标题>

## 规则清单

<!-- 每条规则一行，可执行、可验证，避免描述实现 -->

- R1: 订单取消必须填写取消原因
- R2: 取消原因枚举：不想要了 / 信息填错 / 重复下单 / 其他

## 背景与来源

<!-- 为什么有这些规则、来自哪个 Change 的哪个 Artifact -->

- 来源：CHG-XXXX spec.md「业务规则」节，人工评审通过
- 背景：<简要说明业务背景>

## 适用范围

<!-- 这些规则约束哪些能力/场景 -->

- 适用于：订单取消、订单状态查询相关能力

## 变更记录

| 日期 | Change | 变更 |
| ---- | ------ | ---- |
| <date> | CHG-XXXX | 初次晋升 R1-R2 |
