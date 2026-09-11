# Provider SSE 安全增量（未完成生产联调）

源码 be75e5c。ApprovedProvider.bufferedStream 接受 stream:true，在超时与响应字节上限内缓存完整响应，严格UTF8/DONE/JSON验证后返回上游事件。不是实时token转发，也未接入pi真实Provider链路。既有complete仍拒绝stream:true，冻结Client合同未变。

独立Reviewer发现并验证两处秘密反射绕过：tool_calls数组位置跨事件变化，以及同帧重复index导致拼接顺序歧义。已按choices/tool_calls逻辑index归并，缺失/非法/重复index均失败关闭；回归覆盖跨事件明文/Base64工具参数反射、非法UTF8、无DONE、恶意尾部、大小和超时。Reviewer最终独立复跑29项全部通过、两P1闭合。

固定源码本地HTTPS8项（含SSE成功、反射拒绝、超时）通过；每次合法TLS场景请求1、剩余socket0；不信任TLS证书时请求0。只用合成凭据、临时本地证书；不写证书库，私钥自动删除。证据 evidence/J3/convergence/be75e5c/https.json。

剩余：实时流输出若需要必须另做安全窗口/跨事件验证；生产broker/进程管道与有效权限接线、真实账号加载和真实pi调用尚未完成。不得把此增量统计为三Harness支持。
