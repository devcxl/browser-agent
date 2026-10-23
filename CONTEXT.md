# Browser Agent

This context covers natural-language interactions that help a user inspect and organize browser resources while retaining control over changes to those resources.

## Language

**工具类别**:
A named group of browser capabilities that may be made available to the agent for a user request.
_Avoid_: 工具组, when referring to the codebase's `ToolCategory` concept.

**工具路由**:
The decision about which tool categories are relevant to a user's current request.
_Avoid_: tool selection, when it could mean a user manually choosing tools.

**Jev 决策**:
A bounded, structured choice made by Jev from options supplied by the application; it is not a conversational response or an instruction to perform a browser action.
_Avoid_: Jev chat, Jev agent.

**候选类别**:
The finite set of destinations available to a classification task, defined independently for each kind of browser resource.
_Avoid_: model-generated category names.

**书签分类**:
The assignment of bookmarks to candidate bookmark categories.

**标签页分组**:
The assignment of open tabs to candidate tab groups.

**整理预览**:
A review of proposed bookmark or tab assignments before those changes are applied.
_Avoid_: automatic organization, when the user has not confirmed the proposed changes.
