#### Tools

# Overview

The xAI API supports **tool calling**, enabling Grok to perform actions beyond generating text—like searching the web, executing code, querying your data, or calling your own custom functions. Tools extend what's possible with the API and let you build powerful, interactive applications.

## Types of Tools

The xAI API offers two categories of tools:

| Type | Description | Examples |
|------|-------------|----------|
| **Built-in Tools** | Server-side tools managed by xAI that execute automatically | Web Search, X Search, Code Interpreter, Collections Search |
| **Function Calling** | Custom functions you define that the model can invoke | Database queries, API calls, custom business logic |

Built-in tools run on xAI's servers—you provide the tool configuration, and the API handles execution and returns results. Function calling lets you define your own tools that the model can request, giving you full control over what happens when they're invoked.

## Pricing

Tool requests are priced based on two components: **token usage** and **tool invocations**. Since the model may call multiple tools to answer a query, costs scale with complexity.

For more details on Tools pricing, please check out [the pricing page](/developers/pricing#tools-pricing).

## How It Works

When you provide tools to a request, the xAI API can use them to gather information or perform actions:

1. **Analyzes the query** and determines what information or actions are needed
2. **Decides what to do next**: Make a tool call, or provide a final answer
3. **Executes the tool** (for built-in tools) or returns a tool call request (for function calling)
4. **Processes results** and continues until sufficient information is gathered
5. **Returns the final response** with citations where applicable

## Quick Start

```bash customLanguage="bash"
curl https://api.x.ai/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
  "model": "grok-4.3",
  "stream": true,
  "input": [
    {
      "role": "user",
      "content": "What are the latest updates from xAI?"
    }
  ],
  "tools": [
    { "type": "web_search" },
    { "type": "x_search" },
    { "type": "code_interpreter" }
  ]
}'
```

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import web_search, x_search, code_execution

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        web_search(),
        x_search(),
        code_execution(),
    ],
)

chat.append(user("What are the latest updates from xAI?"))

for response, chunk in chat.stream():
    if chunk.content:
        print(chunk.content, end="", flush=True)

print("\nCitations:", response.citations)
```

```pythonOpenAISDK
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("XAI_API_KEY"),
    base_url="https://api.x.ai/v1",
)

response = client.responses.create(
    model="grok-4.3",
    input=[
        {"role": "user", "content": "What are the latest updates from xAI?"}
    ],
    tools=[
        {"type": "web_search"},
        {"type": "x_search"},
        {"type": "code_interpreter"},
    ],
    stream=True,
)

for event in response:
    if event.type == "response.output_text.delta":
        print(event.delta, end="", flush=True)
```

```javascriptAISDK
import { xai } from '@ai-sdk/xai';
import { streamText } from 'ai';

const { fullStream } = streamText({
  model: xai.responses('grok-4.3'),
  prompt: 'What are the latest updates from xAI?',
  tools: {
    web_search: xai.tools.webSearch(),
    x_search: xai.tools.xSearch(),
    code_execution: xai.tools.codeExecution(),
  },
});

for await (const part of fullStream) {
  if (part.type === 'text-delta') {
    process.stdout.write(part.text);
  } else if (part.type === 'source' && part.sourceType === 'url') {
    console.log(`Citation: ${part.url}`);
  }
}
```

```javascriptOpenAISDK
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

const stream = await client.responses.create({
  model: "grok-4.3",
  input: [
    { role: "user", content: "What are the latest updates from xAI?" }
  ],
  tools: [
    { type: "web_search" },
    { type: "x_search" },
    { type: "code_interpreter" },
  ],
  stream: true,
});

for await (const event of stream) {
  if (event.type === "response.output_text.delta") {
    process.stdout.write(event.delta);
  }
}
```

## Citations

The API automatically returns source URLs for information gathered via tools. See [Citations](/developers/tools/citations) for details on accessing and using citation data.

## Next Steps

* **[Function Calling](/developers/tools/function-calling)** - Define custom tools the model can call
* **[Web Search](/developers/tools/web-search)** - Search the web and browse pages
* **[X Search](/developers/tools/x-search)** - Search X posts, users, and threads
* **[Code Execution](/developers/tools/code-execution)** - Execute Python code in a sandbox
* **[Collections Search](/developers/tools/collections-search)** - Query your uploaded documents
* **[Citations](/developers/tools/citations)** - Access source URLs and inline citations


#### Tools

# Function Calling

Define custom tools that the model can invoke during a conversation. The model requests the call, you execute it locally, and return the result. This enables integration with databases, APIs, and any external system.

> [!WARNING]
>
> With streaming, the function call is returned in whole in a single chunk, not streamed across chunks.

1. Define tools with a name, description, and JSON schema for parameters
2. Include tools in your request
3. Model returns a `tool_call` when it needs external data
4. Execute the function locally and return the result
5. Model continues with your result

## Quick Start

```bash customLanguage="bash"
curl https://api.x.ai/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
  "model": "grok-4.3",
  "input": [
    {"role": "user", "content": "What is the temperature in San Francisco?"}
  ],
  "tools": [
    {
      "type": "function",
      "name": "get_temperature",
      "description": "Get current temperature for a location",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {"type": "string", "description": "City name"},
          "unit": {"type": "string", "enum": ["celsius", "fahrenheit"], "default": "fahrenheit"}
        },
        "required": ["location"]
      }
    }
  ]
}'
```

```pythonXAI
import os
import json

from xai_sdk import Client
from xai_sdk.chat import user, tool, tool_result

client = Client(api_key=os.getenv("XAI_API_KEY"))

# Define tools
tools = [
    tool(
        name="get_temperature",
        description="Get current temperature for a location",
        parameters={
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "City name"},
                "unit": {"type": "string", "enum": ["celsius", "fahrenheit"], "default": "fahrenheit"}
            },
            "required": ["location"]
        },
    ),
]

chat = client.chat.create(
    model="grok-4.3",
    tools=tools,
)
chat.append(user("What is the temperature in San Francisco?"))
response = chat.sample()

# Handle tool calls
if response.tool_calls:
    chat.append(response)
    for tc in response.tool_calls:
        args = json.loads(tc.function.arguments)
        # Execute your function
        result = {"location": args["location"], "temperature": 59, "unit": args.get("unit", "fahrenheit")}
        chat.append(tool_result(json.dumps(result)))

    response = chat.sample()

print(response.content)
```

```pythonOpenAISDK
import os
import json
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("XAI_API_KEY"),
    base_url="https://api.x.ai/v1",
)

tools = [
    {
        "type": "function",
        "name": "get_temperature",
        "description": "Get current temperature for a location",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "City name"},
                "unit": {"type": "string", "enum": ["celsius", "fahrenheit"], "default": "fahrenheit"}
            },
            "required": ["location"]
        },
    },
]

response = client.responses.create(
    model="grok-4.3",
    input=[{"role": "user", "content": "What is the temperature in San Francisco?"}],
    tools=tools,
)

# Handle function calls
for item in response.output:
    if item.type == "function_call":
        args = json.loads(item.arguments)
        result = {"location": args["location"], "temperature": 59, "unit": args.get("unit", "fahrenheit")}

        response = client.responses.create(
            model="grok-4.3",
            input=[{"type": "function_call_output", "call_id": item.call_id, "output": json.dumps(result)}],
            tools=tools,
            previous_response_id=response.id,
        )

for item in response.output:
    if item.type == "message":
        print(item.content[0].text)
```

```javascriptAISDK
import { xai } from '@ai-sdk/xai';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';

const result = streamText({
  model: xai.responses('grok-4.3'),
  tools: {
    getTemperature: tool({
      description: 'Get current temperature for a location',
      parameters: z.object({
        location: z.string().describe('City name'),
        unit: z.enum(['celsius', 'fahrenheit']).default('fahrenheit'),
      }),
      execute: async ({ location, unit }) => ({
        location,
        temperature: unit === 'fahrenheit' ? 59 : 15,
        unit,
      }),
    }),
  },
  stopWhen: stepCountIs(5),
  prompt: 'What is the temperature in San Francisco?',
});

for await (const chunk of result.fullStream) {
  if (chunk.type === 'text-delta') {
    process.stdout.write(chunk.text);
  }
}
```

## Defining Tools with Pydantic

Use Pydantic models for type-safe parameter schemas:

```pythonXAI
from typing import Literal
from pydantic import BaseModel, Field
from xai_sdk.chat import tool

class TemperatureRequest(BaseModel):
    location: str = Field(description="City and state, e.g. San Francisco, CA")
    unit: Literal["celsius", "fahrenheit"] = Field("fahrenheit", description="Temperature unit")

class CeilingRequest(BaseModel):
    location: str = Field(description="City and state, e.g. San Francisco, CA")

# Generate JSON schema from Pydantic models
tools = [
    tool(
        name="get_temperature",
        description="Get current temperature for a location",
        parameters=TemperatureRequest.model_json_schema(),
    ),
    tool(
        name="get_ceiling",
        description="Get current cloud ceiling for a location",
        parameters=CeilingRequest.model_json_schema(),
    ),
]
```

```pythonOpenAISDK
from typing import Literal
from pydantic import BaseModel, Field

class TemperatureRequest(BaseModel):
    location: str = Field(description="City and state, e.g. San Francisco, CA")
    unit: Literal["celsius", "fahrenheit"] = Field("fahrenheit", description="Temperature unit")

class CeilingRequest(BaseModel):
    location: str = Field(description="City and state, e.g. San Francisco, CA")

tools = [
    {
        "type": "function",
        "name": "get_temperature",
        "description": "Get current temperature for a location",
        "parameters": TemperatureRequest.model_json_schema(),
    },
    {
        "type": "function",
        "name": "get_ceiling",
        "description": "Get current cloud ceiling for a location",
        "parameters": CeilingRequest.model_json_schema(),
    },
]
```

## Handling Tool Calls

When the model wants to use your tool, execute the function and return the result:

```pythonXAI
import json

def get_temperature(location: str, unit: str = "fahrenheit") -> dict:
    # In production, call a real weather API
    temp = 59 if unit == "fahrenheit" else 15
    return {"location": location, "temperature": temp, "unit": unit}

def get_ceiling(location: str) -> dict:
    return {"location": location, "ceiling": 15000, "unit": "ft"}

tools_map = {
    "get_temperature": get_temperature,
    "get_ceiling": get_ceiling,
}

chat.append(user("What's the weather in Denver?"))
response = chat.sample()

# Process tool calls
if response.tool_calls:
    chat.append(response)

    for tool_call in response.tool_calls:
        name = tool_call.function.name
        args = json.loads(tool_call.function.arguments)

        result = tools_map[name](**args)
        chat.append(tool_result(json.dumps(result)))

    response = chat.sample()

print(response.content)
```

```pythonOpenAISDK
import json

def get_temperature(location: str, unit: str = "fahrenheit") -> dict:
    temp = 59 if unit == "fahrenheit" else 15
    return {"location": location, "temperature": temp, "unit": unit}

tools_map = {"get_temperature": get_temperature}

# Process function calls
for item in response.output:
    if item.type == "function_call":
        name = item.name
        args = json.loads(item.arguments)

        if name not in tools_map:
            output = json.dumps({"error": f"Unknown function: {name}"})
        else:
            output = json.dumps(tools_map[name](**args))

        response = client.responses.create(
            model="grok-4.3",
            input=[{"type": "function_call_output", "call_id": item.call_id, "output": output}],
            tools=tools,
            previous_response_id=response.id,
        )

for item in response.output:
    if item.type == "message":
        print(item.content[0].text)
```

## Combining with Built-in Tools

Function calling works alongside built-in agentic tools. The model can use web search, then call your custom function:

```pythonXAI
from xai_sdk.chat import tool
from xai_sdk.tools import web_search, x_search

tools = [
    web_search(),                    # Built-in: runs on xAI servers
    x_search(),                      # Built-in: runs on xAI servers
    tool(                            # Custom: runs on your side
        name="save_to_database",
        description="Save research results to the database",
        parameters={
            "type": "object",
            "properties": {
                "data": {"type": "string", "description": "Data to save"}
            },
            "required": ["data"]
        },
    ),
]

chat = client.chat.create(
    model="grok-4.3",
    tools=tools,
)
```

```pythonOpenAISDK
tools = [
    {"type": "web_search"},          # Built-in
    {"type": "x_search"},            # Built-in
    {                                # Custom
        "type": "function",
        "name": "save_to_database",
        "description": "Save research results to the database",
        "parameters": {
            "type": "object",
            "properties": {
                "data": {"type": "string", "description": "Data to save"}
            },
            "required": ["data"]
        },
    },
]
```

When mixing tools:

* **Built-in tools** execute automatically on xAI servers
* **Custom tools** pause execution and return to you for handling

See [Advanced Usage](/developers/tools/advanced-usage#mixing-server-side-and-client-side-tools) for complete examples with tool loops.

## Tool Choice

Control when the model uses tools:

| Value | Behavior |
|-------|----------|
| `"auto"` | Model decides whether to call a tool (default) |
| `"required"` | Model must call at least one tool |
| `"none"` | Disable tool calling |
| `{"type": "function", "function": {"name": "..."}}` | Force a specific tool |

## Parallel Function Calling

By default, parallel function calling is enabled — the model can request multiple tool calls in a single response. Process all of them before continuing:

```pythonWithoutSDK
# response.tool_calls may contain multiple calls
for tool_call in response.tool_calls:
    result = tools_map[tool_call.function.name](**json.loads(tool_call.function.arguments))
    # Append each result...
```

Disable with `parallel_tool_calls: false` in your request.

## Tool Schema Reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier (max 200 tools per request) |
| `description` | Yes | What the tool does — helps the model decide when to use it |
| `parameters` | Yes | JSON Schema defining function inputs |

### Parameter Schema

```json
{
  "type": "object",
  "properties": {
    "location": {
      "type": "string",
      "description": "City name"
    },
    "unit": {
      "type": "string",
      "enum": ["celsius", "fahrenheit"],
      "default": "celsius"
    }
  },
  "required": ["location"]
}
```

The root of a `parameters` schema must be an object (`"type": "object"`); nest any other types inside `properties`. A root `anyOf` or `oneOf` also works when every branch is itself an object, letting you define a tool that accepts one of several object variants:

```json
{
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "kind": { "const": "email" },
        "address": { "type": "string" }
      },
      "required": ["kind", "address"]
    },
    {
      "type": "object",
      "properties": {
        "kind": { "const": "sms" },
        "phone": { "type": "string" }
      },
      "required": ["kind", "phone"]
    }
  ]
}
```

> [!WARNING]
>
> A tool whose `parameters` root is neither an object nor a union of objects (for example, a scalar, an array, or an `anyOf`/`oneOf` with a non-object branch) cannot be compiled into a tool-call grammar and is rejected with a `400` error that names the tool.

## Complete Vercel AI SDK Example

The Vercel AI SDK handles tool definition, execution, and the request/response loop automatically:

```javascriptAISDK
import { xai } from '@ai-sdk/xai';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';

const result = streamText({
  model: xai.responses('grok-4.3'),
  tools: {
    getCurrentTemperature: tool({
      description: 'Get current temperature for a location',
      parameters: z.object({
        location: z.string().describe('City and state, e.g. San Francisco, CA'),
        unit: z.enum(['celsius', 'fahrenheit']).default('fahrenheit'),
      }),
      execute: async ({ location, unit }) => ({
        location,
        temperature: unit === 'fahrenheit' ? 59 : 15,
        unit,
      }),
    }),
    getCurrentCeiling: tool({
      description: 'Get current cloud ceiling for a location',
      parameters: z.object({
        location: z.string().describe('City and state'),
      }),
      execute: async ({ location }) => ({
        location,
        ceiling: 15000,
        ceiling_type: 'broken',
        unit: 'ft',
      }),
    }),
  },
  stopWhen: stepCountIs(5),
  prompt: "What's the temperature and cloud ceiling in San Francisco?",
});

for await (const chunk of result.fullStream) {
  switch (chunk.type) {
    case 'text-delta':
      process.stdout.write(chunk.text);
      break;
    case 'tool-call':
      console.log(`Tool call: ${chunk.toolName}`, chunk.args);
      break;
    case 'tool-result':
      console.log(`Tool result: ${chunk.toolName}`, chunk.result);
      break;
  }
}
```


#### Tools

# Web Search

The Web Search tool enables Grok to search the web in real-time and browse web pages to find information. This powerful tool allows the model to search the internet, access web pages, and extract relevant information to answer queries with up-to-date content.

## SDK Support

| SDK/API | Tool Name |
|---------|-----------|
| xAI SDK | `web_search` |
| OpenAI Responses API | `web_search` |
| Vercel AI SDK | `xai.tools.webSearch()` |

This tool is also supported in all Responses API compatible SDKs.

## Basic Usage

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import web_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",  # reasoning model
    tools=[web_search()],
    include=["verbose_streaming"],
)

chat.append(user("What is xAI?"))

is_thinking = True
for response, chunk in chat.stream():
    for tool_call in chunk.tool_calls:
        print(f"\\nCalling tool: {tool_call.function.name} with arguments: {tool_call.function.arguments}")
    if response.usage.reasoning_tokens and is_thinking:
        print(f"\\rThinking... ({response.usage.reasoning_tokens} tokens)", end="", flush=True)
    if chunk.content and is_thinking:
        print("\\n\\nFinal Response:")
        is_thinking = False
    if chunk.content and not is_thinking:
        print(chunk.content, end="", flush=True)

print("\\n\\nCitations:")
print(response.citations)
```

```pythonOpenAISDK
import os
from openai import OpenAI

api_key = os.getenv("XAI_API_KEY")
client = OpenAI(
    api_key=api_key,
    base_url="https://api.x.ai/v1",
)

response = client.responses.create(
    model="grok-4.3",
    input=[
        {
            "role": "user",
            "content": "What is xAI?",
        },
    ],
    tools=[
        {
            "type": "web_search",
        },
    ],
)

print(response)
```

```javascriptAISDK
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';

const { text, sources } = await generateText({
  model: xai.responses('grok-4.3'),
  prompt: 'What is xAI?',
  tools: {
    web_search: xai.tools.webSearch(),
  },
});

console.log(text);
console.log('Citations:', sources);
```

```bash
curl https://api.x.ai/v1/responses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $XAI_API_KEY" \\
  -d '{
  "model": "grok-4.3",
  "input": [
    {
      "role": "user",
      "content": "What is xAI?"
    }
  ],
  "tools": [
    {
      "type": "web_search"
    }
  ]
}'
```

## Web Search Parameters

| Parameter | Description |
|-----------|-------------|
| `allowed_domains` | Only search within specific domains (max 5) |
| `excluded_domains` | Exclude specific domains from search (max 5) |
| `enable_image_understanding` | Enable analysis of images found during browsing |
| `enable_image_search` | Enable image search results that can be embedded in responses |

### Only Search in Specific Domains

Use `allowed_domains` to make the web search **only** perform the search and web browsing on web pages that fall within the specified domains.

> [!NOTE]
>
> `allowed_domains` cannot be set together with `excluded_domains` in the same request.

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import web_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        web_search(allowed_domains=["grokipedia.com"]),
    ],
)

chat.append(user("What is xAI?"))
# stream or sample the response...
```

```pythonOpenAISDK
response = client.responses.create(
    model="grok-4.3",
    input=[{"role": "user", "content": "What is xAI?"}],
    tools=[
        {
            "type": "web_search",
            "filters": {"allowed_domains": ["grokipedia.com"]},
        },
    ],
)
```

```javascriptAISDK
const { text } = await generateText({
  model: xai.responses('grok-4.3'),
  prompt: 'What is xAI?',
  tools: {
    web_search: xai.tools.webSearch({
      allowedDomains: ['grokipedia.com'],
    }),
  },
});
```

### Exclude Specific Domains

Use `excluded_domains` to prevent the model from including the specified domains in any web search tool invocations.

```pythonXAI
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        web_search(excluded_domains=["grokipedia.com"]),
    ],
)
```

```pythonOpenAISDK
response = client.responses.create(
    model="grok-4.3",
    input=[{"role": "user", "content": "What is xAI?"}],
    tools=[
        {
            "type": "web_search",
            "filters": {"excluded_domains": ["grokipedia.com"]},
        },
    ],
)
```

### Enable Image Understanding

Setting `enable_image_understanding` to true equips the agent with access to the `view_image` tool, allowing it to analyze images encountered during the search process.

When enabled, you will see `SERVER_SIDE_TOOL_VIEW_IMAGE` in `response.server_side_tool_usage` along with the number of times it was called.

> [!NOTE]
>
> Enabling this parameter for Web Search will also enable the image understanding for X Search tool if it's also included in the request.

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import web_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        web_search(enable_image_understanding=True),
    ],
)

chat.append(user("What is included in the image in xAI's official website?"))
# stream or sample the response...
```

```pythonOpenAISDK
response = client.responses.create(
    model="grok-4.3",
    input=[
        {
            "role": "user",
            "content": "What is included in the image in xAI's official website?",
        },
    ],
    tools=[
        {
            "type": "web_search",
            "enable_image_understanding": True,
        },
    ],
)
```

```javascriptAISDK
const { text } = await generateText({
  model: xai.responses('grok-4.3'),
  prompt: "What is included in the image in xAI's official website?",
  tools: {
    web_search: xai.tools.webSearch({
      enableImageUnderstanding: true,
    }),
  },
});
```

### Enable Image Search

Setting `enable_image_search` to true lets Grok search for relevant images and include them in the response as Markdown image embeds such as `![alt](url)`.

> [!NOTE]
>
> After Grok searches for images, the returned images are included in the model context used to write the response. This is separate from `enable_image_understanding`, which lets Grok inspect images it finds while browsing regular web pages.

The Vercel AI SDK does not yet expose `enableImageSearch`; the examples below use the Responses API and xAI Python SDK.

```bash customLanguage="bash"
curl https://api.x.ai/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
  "model": "grok-4.3",
  "input": [
    {
      "role": "user",
      "content": "Show me images of Starship on the launch pad."
    }
  ],
  "tools": [
    {
      "type": "web_search",
      "enable_image_search": true
    }
  ]
}'
```

```python customLanguage="pythonXAI"
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import web_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        web_search(enable_image_search=True),
    ],
)

chat.append(user("Show me images of Starship on the launch pad."))
response = chat.sample()
print(response.content)
print(response.server_side_tool_usage)
```

```python customLanguage="pythonOpenAISDK"
response = client.responses.create(
    model="grok-4.3",
    input=[
        {
            "role": "user",
            "content": "Show me images of Starship on the launch pad.",
        },
    ],
    tools=[
        {
            "type": "web_search",
            "enable_image_search": True,
        },
    ],
)

print(response)
```

A response can include Markdown image embeds directly in the output text:

```output
![Why the SpaceX Starship launch pad matters](https://www.astronomy.com/wp-content/uploads/2024/09/starship-test-flight-mission-scaled.jpg)

Here are several high-quality images of SpaceX's Starship on the launch pad at Starbase in Boca Chica, Texas.
```

In the xAI SDK, successful image search executions appear in `response.server_side_tool_usage` as `SERVER_SIDE_TOOL_IMAGE_SEARCH`.

## Citations

For details on how to retrieve and use citations from search results, see the [Citations](/developers/tools/citations) page.


#### Tools

# X Search

The X Search tool enables Grok to perform keyword search, semantic search, user search, and thread fetch on X (formerly Twitter). This powerful tool allows the model to access real-time social media content, analyze posts, and gather insights from X's vast data.

## SDK Support

| SDK/API | Tool Name |
|---------|-----------|
| xAI SDK | `x_search` |
| OpenAI Responses API | `x_search` |
| Vercel AI SDK | `xai.tools.xSearch()` |

This tool is also supported in all Responses API compatible SDKs.

## Basic Usage

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import x_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",  # reasoning model
    tools=[x_search()],
    include=["verbose_streaming"],
)

chat.append(user("What are people saying about xAI on X?"))

is_thinking = True
for response, chunk in chat.stream():
    for tool_call in chunk.tool_calls:
        print(f"\\nCalling tool: {tool_call.function.name} with arguments: {tool_call.function.arguments}")
    if response.usage.reasoning_tokens and is_thinking:
        print(f"\\rThinking... ({response.usage.reasoning_tokens} tokens)", end="", flush=True)
    if chunk.content and is_thinking:
        print("\\n\\nFinal Response:")
        is_thinking = False
    if chunk.content and not is_thinking:
        print(chunk.content, end="", flush=True)

print("\\n\\nCitations:")
print(response.citations)
```

```pythonOpenAISDK
import os
from openai import OpenAI

api_key = os.getenv("XAI_API_KEY")
client = OpenAI(
    api_key=api_key,
    base_url="https://api.x.ai/v1",
)

response = client.responses.create(
    model="grok-4.3",
    input=[
        {
            "role": "user",
            "content": "What are people saying about xAI on X?",
        },
    ],
    tools=[
        {
            "type": "x_search",
        },
    ],
)

print(response)
```

```javascriptAISDK
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';

const { text, sources } = await generateText({
  model: xai.responses('grok-4.3'),
  prompt: 'What are people saying about xAI on X?',
  tools: {
    x_search: xai.tools.xSearch(),
  },
});

console.log(text);
console.log('Citations:', sources);
```

```bash
curl https://api.x.ai/v1/responses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $XAI_API_KEY" \\
  -d '{
  "model": "grok-4.3",
  "input": [
    {
      "role": "user",
      "content": "What are people saying about xAI on X?"
    }
  ],
  "tools": [
    {
      "type": "x_search"
    }
  ]
}'
```

## X Search Parameters

| Parameter | Description |
|-----------|-------------|
| `allowed_x_handles` | Only consider posts from specific X handles (max 20) |
| `excluded_x_handles` | Exclude posts from specific X handles (max 20) |
| `from_date` | Start date for search range (ISO8601 format) |
| `to_date` | End date for search range (ISO8601 format) |
| `enable_image_understanding` | Enable analysis of images in posts |
| `enable_video_understanding` | Enable analysis of videos in posts |

### Only Consider Posts from Specific Handles

Use `allowed_x_handles` to consider X posts only from a given list of X handles. The maximum number of handles you can include is 20.

> [!NOTE]
>
> `allowed_x_handles` cannot be set together with `excluded_x_handles` in the same request.

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import x_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        x_search(allowed_x_handles=["elonmusk"]),
    ],
)

chat.append(user("What is the current status of xAI?"))
# stream or sample the response...
```

```pythonOpenAISDK
response = client.responses.create(
    model="grok-4.3",
    input=[{"role": "user", "content": "What is the current status of xAI?"}],
    tools=[
        {
            "type": "x_search",
            "allowed_x_handles": ["elonmusk"],
        },
    ],
)
```

```javascriptAISDK
const { text } = await generateText({
  model: xai.responses('grok-4.3'),
  prompt: 'What is the current status of xAI?',
  tools: {
    x_search: xai.tools.xSearch({
      allowedXHandles: ['elonmusk'],
    }),
  },
});
```

### Exclude Posts from Specific Handles

Use `excluded_x_handles` to prevent the model from including X posts from the specified handles in any X search tool invocations. The maximum number of handles you can exclude is 20.

```pythonXAI
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        x_search(excluded_x_handles=["elonmusk"]),
    ],
)
```

```pythonOpenAISDK
response = client.responses.create(
    model="grok-4.3",
    input=[{"role": "user", "content": "What is the current status of xAI?"}],
    tools=[
        {
            "type": "x_search",
            "excluded_x_handles": ["elonmusk"],
        },
    ],
)
```

```javascriptAISDK
const { text } = await generateText({
  model: xai.responses('grok-4.3'),
  prompt: 'What is the current status of xAI?',
  tools: {
    x_search: xai.tools.xSearch({
      excludedXHandles: ['elonmusk'],
    }),
  },
});
```

### Date Range

You can restrict the date range of search data used by specifying `from_date` and `to_date`. This limits the data to the period from `from_date` to `to_date`, including both dates.

Both fields need to be in ISO8601 format, e.g., "YYYY-MM-DD". If you're using the xAI Python SDK, the `from_date` and `to_date` fields can be passed as `datetime.datetime` objects.

```pythonXAI
import os
from datetime import datetime

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import x_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        x_search(
            from_date=datetime(2025, 10, 1),
            to_date=datetime(2025, 10, 10),
        ),
    ],
)

chat.append(user("What is the current status of xAI?"))
# stream or sample the response...
```

```pythonOpenAISDK
response = client.responses.create(
    model="grok-4.3",
    input=[{"role": "user", "content": "What is the current status of xAI?"}],
    tools=[
        {
            "type": "x_search",
            "from_date": "2025-10-01",
            "to_date": "2025-10-10",
        },
    ],
)
```

```javascriptAISDK
const { text } = await generateText({
  model: xai.responses('grok-4.3'),
  prompt: 'What is the current status of xAI?',
  tools: {
    x_search: xai.tools.xSearch({
      fromDate: '2025-10-01',
      toDate: '2025-10-10',
    }),
  },
});
```

### Enable Image Understanding

Setting `enable_image_understanding` to true allows the agent to analyze images in X posts encountered during the search process.

```pythonXAI
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        x_search(enable_image_understanding=True),
    ],
)
```

```pythonOpenAISDK
response = client.responses.create(
    model="grok-4.3",
    input=[{"role": "user", "content": "Find X posts with images about AI"}],
    tools=[
        {
            "type": "x_search",
            "enable_image_understanding": True,
        },
    ],
)
```

```javascriptAISDK
const { text } = await generateText({
  model: xai.responses('grok-4.3'),
  prompt: 'Find X posts with images about AI',
  tools: {
    x_search: xai.tools.xSearch({
      enableImageUnderstanding: true,
    }),
  },
});
```

### Enable Video Understanding

Setting `enable_video_understanding` to true allows the agent to analyze videos in X posts. This is only available for X Search (not Web Search).

```pythonXAI
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        x_search(enable_video_understanding=True),
    ],
)
```

```pythonOpenAISDK
response = client.responses.create(
    model="grok-4.3",
    input=[{"role": "user", "content": "Find X posts with videos about AI"}],
    tools=[
        {
            "type": "x_search",
            "enable_video_understanding": True,
        },
    ],
)
```

```javascriptAISDK
const { text } = await generateText({
  model: xai.responses('grok-4.3'),
  prompt: 'Find X posts with videos about AI',
  tools: {
    x_search: xai.tools.xSearch({
      enableVideoUnderstanding: true,
    }),
  },
});
```

## Citations

For details on how to retrieve and use citations from search results, see the [Citations](/developers/tools/citations) page.


#### Tools

# Code Execution Tool

The code execution tool enables Grok to write and execute Python code in real-time, dramatically expanding its capabilities beyond text generation. This powerful feature allows Grok to perform precise calculations, complex data analysis, statistical computations, and solve mathematical problems that would be impossible through text alone.

## Key Capabilities

* **Mathematical Computations**: Solve complex equations, perform statistical analysis, and handle numerical calculations with precision
* **Data Analysis**: Process datasets, and extract insights from the prompt
* **Financial Modeling**: Build financial models, calculate risk metrics, and perform quantitative analysis
* **Scientific Computing**: Handle scientific calculations, simulations, and data transformations
* **Code Generation & Testing**: Write, test, and debug Python code snippets in real-time

## When to Use Code Execution

The code execution tool is particularly valuable for:

* **Numerical Problems**: When you need exact calculations rather than approximations
* **Data Processing**: Analyzing complex data from the prompt
* **Complex Logic**: Multi-step calculations that require intermediate results
* **Verification**: Double-checking mathematical results or validating assumptions

## SDK Support

The code execution tool is available across multiple SDKs and APIs with different naming conventions:

| SDK/API | Tool Name | Description |
|---------|-----------|-------------|
| xAI SDK | `code_execution` | Native xAI SDK implementation |
| OpenAI Responses API | `code_interpreter` | Compatible with OpenAI's API format |
| Vercel AI SDK | `xai.tools.codeExecution()` | Vercel AI SDK integration |

This tool is also supported in all Responses API compatible SDKs.

## Implementation Example

Below are comprehensive examples showing how to integrate the code execution tool across different platforms and use cases.

### Basic Calculations

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import code_execution

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",  # reasoning model
    tools=[code_execution()],
    include=["verbose_streaming"],
)

# Ask for a mathematical calculation
chat.append(user("Calculate the compound interest for $10,000 at 5% annually for 10 years"))

is_thinking = True
for response, chunk in chat.stream():
    # View the server-side tool calls as they are being made in real-time
    for tool_call in chunk.tool_calls:
        print(f"\\nCalling tool: {tool_call.function.name} with arguments: {tool_call.function.arguments}")
    if response.usage.reasoning_tokens and is_thinking:
        print(f"\\rThinking... ({response.usage.reasoning_tokens} tokens)", end="", flush=True)
    if chunk.content and is_thinking:
        print("\\n\\nFinal Response:")
        is_thinking = False
    if chunk.content and not is_thinking:
        print(chunk.content, end="", flush=True)

print("\\n\\nCitations:")
print(response.citations)
print("\\n\\nUsage:")
print(response.usage)
print(response.server_side_tool_usage)
print("\\n\\nServer Side Tool Calls:")
print(response.tool_calls)
```

```pythonOpenAISDK
import os
from openai import OpenAI

api_key = os.getenv("XAI_API_KEY")
client = OpenAI(
    api_key=api_key,
    base_url="https://api.x.ai/v1",
)

response = client.responses.create(
    model="grok-4.3",
    input=[
        {
            "role": "user",
            "content": "Calculate the compound interest for $10,000 at 5% annually for 10 years",
        },
    ],
    tools=[
        {
            "type": "code_interpreter",
        },
    ],
)

print(response)
```

```pythonRequests
import os
import requests

url = "https://api.x.ai/v1/responses"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {os.getenv('XAI_API_KEY')}"
}
payload = {
    "model": "grok-4.3",
    "input": [
        {
            "role": "user",
            "content": "Calculate the compound interest for $10,000 at 5% annually for 10 years"
        }
    ],
    "tools": [
        {
            "type": "code_interpreter",
        }
    ]
}
response = requests.post(url, headers=headers, json=payload)
print(response.json())
```

```bash
curl https://api.x.ai/v1/responses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $XAI_API_KEY" \\
  -d '{
  "model": "grok-4.3",
  "input": [
    {
      "role": "user",
      "content": "Calculate the compound interest for $10,000 at 5% annually for 10 years"
    }
  ],
  "tools": [
    {
      "type": "code_interpreter"
    }
  ]
}'
```

```javascriptAISDK
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: xai.responses('grok-4.3'),
  prompt: 'Calculate the compound interest for $10,000 at 5% annually for 10 years',
  tools: {
    code_execution: xai.tools.codeExecution(),
  },
});

console.log(text);
```

### Data Analysis

```pythonXAI
import os
from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import code_execution

client = Client(api_key=os.getenv("XAI_API_KEY"))

# Multi-turn conversation with data analysis
chat = client.chat.create(
    model="grok-4.3",  # reasoning model
    tools=[code_execution()],
    include=["verbose_streaming"],
)

# Step 1: Load and analyze data
chat.append(user("""
I have sales data for Q1-Q4: [120000, 135000, 98000, 156000].
Please analyze this data and create a visualization showing:
1. Quarterly trends
2. Growth rates
3. Statistical summary
"""))

print("##### Step 1: Data Analysis #####\\n")

is_thinking = True
for response, chunk in chat.stream():
    # View the server-side tool calls as they are being made in real-time
    for tool_call in chunk.tool_calls:
        print(f"\\nCalling tool: {tool_call.function.name} with arguments: {tool_call.function.arguments}")
    if response.usage.reasoning_tokens and is_thinking:
        print(f"\\rThinking... ({response.usage.reasoning_tokens} tokens)", end="", flush=True)
    if chunk.content and is_thinking:
        print("\\n\\nAnalysis Results:")
        is_thinking = False
    if chunk.content and not is_thinking:
        print(chunk.content, end="", flush=True)

print("\\n\\nCitations:")
print(response.citations)
print("\\n\\nUsage:")
print(response.usage)
print(response.server_side_tool_usage)

chat.append(response)

# Step 2: Follow-up analysis
chat.append(user("Now predict Q1 next year using linear regression"))

print("\\n\\n##### Step 2: Prediction Analysis #####\\n")

is_thinking = True
for response, chunk in chat.stream():
    # View the server-side tool calls as they are being made in real-time
    for tool_call in chunk.tool_calls:
        print(f"\\nCalling tool: {tool_call.function.name} with arguments: {tool_call.function.arguments}")
    if response.usage.reasoning_tokens and is_thinking:
        print(f"\\rThinking... ({response.usage.reasoning_tokens} tokens)", end="", flush=True)
    if chunk.content and is_thinking:
        print("\\n\\nPrediction Results:")
        is_thinking = False
    if chunk.content and not is_thinking:
        print(chunk.content, end="", flush=True)

print("\\n\\nCitations:")
print(response.citations)
print("\\n\\nUsage:")
print(response.usage)
print(response.server_side_tool_usage)
print("\\n\\nServer Side Tool Calls:")
print(response.tool_calls)
```

```javascriptAISDK
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';

// Step 1: Load and analyze data
const step1 = await generateText({
  model: xai.responses('grok-4.3'),
  prompt: \`I have sales data for Q1-Q4: [120000, 135000, 98000, 156000].
Please analyze this data and create a visualization showing:
1. Quarterly trends
2. Growth rates
3. Statistical summary\`,
  tools: {
    code_execution: xai.tools.codeExecution(),
  },
});

console.log('##### Step 1: Data Analysis #####');
console.log(step1.text);

// Step 2: Follow-up analysis using previousResponseId
const step2 = await generateText({
  model: xai.responses('grok-4.3'),
  prompt: 'Now predict Q1 next year using linear regression',
  tools: {
    code_execution: xai.tools.codeExecution(),
  },
  providerOptions: {
    xai: {
      previousResponseId: step1.response.id,
    },
  },
});

console.log('##### Step 2: Prediction Analysis #####');
console.log(step2.text);
```

## Best Practices

### 1. **Be Specific in Requests**

Provide clear, detailed instructions about what you want the code to accomplish:

```pythonWithoutSDK
# Good: Specific and clear
"Calculate the correlation matrix for these variables and highlight correlations above 0.7"

# Avoid: Vague requests  
"Analyze this data"
```

### 2. **Provide Context and Data Format**

Always specify the data format and any constraints on the data, and provide as much context as possible:

```pythonWithoutSDK
# Good: Includes data format and requirements
"""
Here's my CSV data with columns: date, revenue, costs
Please calculate monthly profit margins and identify the best-performing month.
Data: [['2024-01', 50000, 35000], ['2024-02', 55000, 38000], ...]
"""
```

### 3. **Use Appropriate Model Settings**

* **Temperature**: Use lower values (0.0-0.3) for mathematical calculations
* **Model**: Use reasoning models like `grok-4.3` for better code generation

## Common Use Cases

### Financial Analysis

```pythonWithoutSDK
# Portfolio optimization, risk calculations, option pricing
"Calculate the Sharpe ratio for a portfolio with returns [0.12, 0.08, -0.03, 0.15] and risk-free rate 0.02"
```

### Statistical Analysis

```pythonWithoutSDK
# Hypothesis testing, regression analysis, probability distributions
"Perform a t-test to compare these two groups and interpret the p-value: Group A: [23, 25, 28, 30], Group B: [20, 22, 24, 26]"
```

### Scientific Computing

```pythonWithoutSDK
# Simulations, numerical methods, equation solving
"Solve this differential equation using numerical methods: dy/dx = x^2 + y, with initial condition y(0) = 1"
```

## Limitations and Considerations

* **Execution Environment**: Code runs in a sandboxed Python environment with common libraries pre-installed
* **Time Limits**: Complex computations may have execution time constraints
* **Memory Usage**: Large datasets might hit memory limitations
* **Package Availability**: Most popular Python packages (NumPy, Pandas, Matplotlib, SciPy) are available
* **File I/O**: Limited file system access for security reasons

## Security Notes

* Code execution happens in a secure, isolated environment
* No access to external networks or file systems
* Temporary execution context that doesn't persist between requests
* All computations are stateless and secure

#### Tools

# Collections Search Tool

The collections search tool enables Grok to search through your uploaded knowledge bases (collections), allowing it to retrieve relevant information from your documents to provide more accurate and contextually relevant responses. This tool is particularly powerful for analyzing complex documents like financial reports, legal contracts, or technical documentation, where Grok can autonomously search through multiple documents and synthesize information to answer sophisticated analytical questions.

For an introduction to Collections, please check out the [Collections documentation](/developers/files/collections).

## Key Capabilities

* **Document Retrieval**: Search across uploaded files and collections to find relevant information
* **Semantic Search**: Find documents based on meaning and context, not just keywords
* **Knowledge Base Integration**: Seamlessly integrate your proprietary data with Grok's reasoning
* **RAG Applications**: Power retrieval-augmented generation workflows
* **Multi-format Support**: Search across PDFs, text files, CSVs, and other supported formats

## When to Use Collections Search

The collections search tool is particularly valuable for:

* **Enterprise Knowledge Bases**: When you need Grok to reference internal documents and policies
* **Financial Analysis**: Analyzing SEC filings, earnings reports, and financial statements across multiple documents
* **Customer Support**: Building chatbots that can answer questions based on your product documentation
* **Research & Due Diligence**: Synthesizing information from academic papers, technical reports, or industry analyses
* **Compliance & Legal**: Ensuring responses are grounded in your official guidelines and regulations
* **Personal Knowledge Management**: Organizing and querying your personal document collections

## SDK Support

The collections search tool is available across multiple SDKs and APIs with different naming conventions:

| SDK/API | Tool Name | Description |
|---------|-----------|-------------|
| xAI SDK | `collections_search` | Native xAI SDK implementation |
| OpenAI Responses API | `file_search` | Compatible with OpenAI's API format |

This tool is also supported in all Responses API compatible SDKs.

## Implementation Example

### End-to-End Financial Analysis Example

This comprehensive example demonstrates analyzing Tesla's SEC filings using the collections search tool. It covers:

1. Creating a collection for document storage
2. Uploading multiple financial documents concurrently (10-Q and 10-K filings)
3. Using Grok with collections search to analyze and synthesize information across documents in an agentic manner
4. Enabling code execution to allow the model to perform calculations and mathematical analysis effectively should it be needed.
5. Receiving cited responses and tool usage information

This pattern is applicable to any document analysis workflow where you need to search through and reason over multiple documents.

```pythonXAI
import asyncio
import os

import httpx

from xai_sdk import AsyncClient
from xai_sdk.chat import user
from xai_sdk.proto import collections_pb2
from xai_sdk.tools import code_execution, collections_search

TESLA_10_Q_PDF_URL = "https://ir.tesla.com/_flysystem/s3/sec/000162828025045968/tsla-20250930-gen.pdf"
TESLA_10_K_PDF_URL = "https://ir.tesla.com/_flysystem/s3/sec/000162828025003063/tsla-20241231-gen.pdf"
async def main():
    client = AsyncClient(api_key=os.getenv("XAI_API_KEY"), management_api_key=os.getenv("XAI_MANAGEMENT_API_KEY"))

    # Step 1: Create a collection for Tesla SEC filings
    response = await client.collections.create("tesla-sec-filings")
    print(f"Created collection: {response.collection_id}")

    # Step 2: Upload documents to the collection concurrently
    async def upload_document(
        url: str, name: str, collection_id: str, http_client: httpx.AsyncClient
    ) -> None:
        pdf_response = await http_client.get(url, timeout=30.0)
        pdf_content = pdf_response.content

        print(f"Uploading {name} document to collection")
        response = await client.collections.upload_document(
            collection_id=collection_id,
            name=name,
            data=pdf_content,
        )

        # Poll until document is processed and ready for search
        response = await client.collections.get_document(response.file_metadata.file_id, collection_id)
        print(f"Waiting for document {name} to be processed")
        while response.status != collections_pb2.DOCUMENT_STATUS_PROCESSED:
            await asyncio.sleep(3)
            response = await client.collections.get_document(response.file_metadata.file_id, collection_id)

        print(f"Document {name} processed")

    # Upload both documents concurrently
    async with httpx.AsyncClient() as http_client:
        await asyncio.gather(
            upload_document(TESLA_10_Q_PDF_URL, "tesla-10-Q-2024.pdf", response.collection_id, http_client),
            upload_document(TESLA_10_K_PDF_URL, "tesla-10-K-2024.pdf", response.collection_id, http_client),
        )

    # Step 3: Create a chat with collections search enabled
    chat = client.chat.create(
        model="grok-4.3",  # Use a reasoning model for better analysis
        tools=[
            collections_search(
                collection_ids=[response.collection_id],
            ),
            code_execution(),
        ],
        include=["verbose_streaming"],
    )

    # Step 4: Ask a complex analytical question that requires searching multiple documents
    chat.append(
        user(
            "How many consumer vehicles did Tesla produce in total in 2024 and 2025? "
            "Show your working and cite your sources."
        )
    )

    # Step 5: Stream the response and display reasoning progress
    is_thinking = True
    async for response, chunk in chat.stream():
        # View server-side tool calls as they happen
        for tool_call in chunk.tool_calls:
            print(f"\\nCalling tool: {tool_call.function.name} with arguments: {tool_call.function.arguments}")
        if response.usage.reasoning_tokens and is_thinking:
            print(f"\\rThinking... ({response.usage.reasoning_tokens} tokens)", end="", flush=True)
        if chunk.content and is_thinking:
            print("\\n\\nFinal Response:")
            is_thinking = False
        if chunk.content and not is_thinking:
            print(chunk.content, end="", flush=True)
        latest_response = response

    # Step 6: Review citations and tool usage
    print("\\n\\nCitations:")
    print(latest_response.citations)
    print("\\n\\nUsage:")
    print(latest_response.usage)
    print(latest_response.server_side_tool_usage)
    print("\\n\\nTool Calls:")
    print(latest_response.tool_calls)
if __name__ == "__main__":
    asyncio.run(main())
```

```pythonOpenAISDK
import os
from openai import OpenAI

# Using OpenAI SDK with xAI API (requires pre-created collection)
api_key = os.getenv("XAI_API_KEY")
client = OpenAI(
    api_key=api_key,
    base_url="https://api.x.ai/v1",
)

# Note: You must create the collection and upload documents first using either the xAI console (console.x.ai) or the xAI SDK
# The collection_id below should be replaced with your actual collection ID
response = client.responses.create(
    model="grok-4.3",
    input=[
        {
            "role": "user",
            "content": "How many consumer vehicles did Tesla produce in total in 2024 and 2025? Show your working and cite your sources.",
        },
    ],
    tools=[
        {
            "type": "file_search",
            "vector_store_ids": ["your_collection_id_here"],  # Replace with actual collection ID
            "max_num_results": 10
        },
        {"type": "code_interpreter"},  # Enable code execution for calculations
    ],
)

print(response)
```

```javascriptAISDK
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

const openai = createOpenAI({
  baseURL: 'https://api.x.ai/v1',
  apiKey: process.env.XAI_API_KEY,
});

const result = streamText({
  model: openai('grok-4.3'),
  prompt: 'What documents do you have access to?',
  tools: {
    file_search: openai.tools.fileSearch({
      vectorStoreIds: ['your-vector-store-id'],
      maxNumResults: 5,
    }),
  },
});
```

```pythonRequests
import os
import requests

# Using raw requests (requires pre-created collection)
url = "https://api.x.ai/v1/responses"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {os.getenv('XAI_API_KEY')}"
}
payload = {
    "model": "grok-4.3",
    "input": [
        {
            "role": "user",
            "content": "How many consumer vehicles did Tesla produce in total in 2024 and 2025? Show your working and cite your sources."
        }
    ],
    "tools": [
        {
            "type": "file_search",
            "vector_store_ids": ["your_collection_id_here"],  # Replace with actual collection ID
            "max_num_results": 10,
        },
        {"type": "code_interpreter"}  # Enable code execution for calculations
    ]
}
response = requests.post(url, headers=headers, json=payload)
print(response.json())
```

```bash
# Using curl (requires pre-created collection)
curl https://api.x.ai/v1/responses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $XAI_API_KEY" \\
  -d '{
  "model": "grok-4.3",
  "input": [
    {
      "role": "user",
      "content": "How many consumer vehicles did Tesla produce in total in 2024 and 2025? Show your working and cite your sources."
    }
  ],
  "tools": [
    {
      "type": "file_search",
      "vector_store_ids": ["your_collection_id_here"],
      "max_num_results": 10
    },
    {
      "type": "code_interpreter"
    }
  ]
}'
```

## Example Output

When you run the Python xAI SDK example above, you'll see output like this showing the complete workflow from collection creation to the final analyzed response:

```output
Created collection: collection_3be0eec8-ee8e-4a18-a9d4-fb70a3150d64
Uploading tesla-10-K-2024.pdf document to collection
Uploading tesla-10-Q-2024.pdf document to collection
Waiting for document tesla-10-K-2024.pdf to be processed
Waiting for document tesla-10-Q-2024.pdf to be processed
Document tesla-10-Q-2024.pdf processed
Document tesla-10-K-2024.pdf processed

Thinking... (199 tokens)
Calling tool: collections_search with arguments: {"query":"Tesla total vehicle production 2024","limit":10}
Thinking... (370 tokens)
Calling tool: collections_search with arguments: {"query":"Tesla total vehicles produced 2024","limit":5}
Thinking... (370 tokens)
Calling tool: collections_search with arguments: {"query":"Tesla vehicles produced 2025 Q1 Q2 Q3","limit":5}
Thinking... (477 tokens)
Calling tool: collections_search with arguments: {"query":"Tesla production and deliveries 2024 all quarters","limit":10}
Thinking... (477 tokens)
Calling tool: collections_search with arguments: {"query":"Tesla production and deliveries 2025 Q1 Q2 Q3","limit":10}
Thinking... (569 tokens)
Calling tool: collections_search with arguments: {"query":"Tesla total production 2024 full year consumer vehicles","limit":5}
Thinking... (776 tokens)
Calling tool: collections_search with arguments: {"query":"Tesla annual vehicle production 2024 total","limit":5}
Thinking... (1148 tokens)
Calling tool: collections_search with arguments: {"query":"Tesla Q4 2024 production and deliveries","limit":5}
Thinking... (1240 tokens)
Calling tool: collections_search with arguments: {"query":"Tesla Q1 2024 vehicle production","limit":3}
Thinking... (1240 tokens)
Calling tool: collections_search with arguments: {"query":"Tesla Q2 2024 vehicle production","limit":3}
Thinking... (1240 tokens)
Calling tool: collections_search with arguments: {"query":"Tesla Q3 2024 vehicle production","limit":3}
Thinking... (1240 tokens)
Calling tool: collections_search with arguments: {"query":"Tesla Q4 2024 vehicle production","limit":3}
Thinking... (2804 tokens)
Calling tool: collections_search with arguments: {"query":"Tesla vehicle production nine months 2024","limit":5}
Thinking... (3352 tokens)

Final Response:
### Working

To answer this question, I used the collections_search tool to query Tesla's official 
financial filings (10-K and 10-Q reports) for production numbers. Tesla reports vehicle 
production and deliveries quarterly, and consumer vehicles refer to passenger vehicles 
like Model 3, Model Y, Model S, Model X, and Cybertruck (excluding Tesla Semi or other 
non-consumer products).

#### Step 1: 2024 Production
Based on Tesla's official quarterly production and delivery reports (aggregated from SEC 
filings and press releases referenced in the collections), Tesla produced **1,773,443 
consumer vehicles in 2024**.
  - Q1 2024: 433,371 produced
  - Q2 2024: 410,831 produced
  - Q3 2024: 469,796 produced
  - Q4 2024: 459,445 produced

#### Step 2: 2025 Production
The Q3 2025 10-Q filing explicitly states: "In 2025, we produced approximately 1,220,000 
consumer vehicles [...] through the third quarter."
  - This is the sum of Q1, Q2, and Q3 2025 production
  - Q4 2025 data is not available as of November 13, 2025

#### Step 3: Total for 2024 and 2025
- 2024 full year: 1,773,443
- 2025 (through Q3): 1,220,000
- **Total: 2,993,443 consumer vehicles**

Citations:
['collections://collection_3be0eec8-ee8e-4a18-a9d4-fb70a3150d64/files/file_d4d1a968-9037-4caa-8eca-47a1563f28ab', 
 'collections://collection_3be0eec8-ee8e-4a18-a9d4-fb70a3150d64/files/file_ff41a42e-6cdc-4ca1-918a-160644d52704']

Usage:
completion_tokens: 1306
prompt_tokens: 383265
total_tokens: 387923
prompt_text_tokens: 383265
reasoning_tokens: 3352
cached_prompt_text_tokens: 177518

{'SERVER_SIDE_TOOL_COLLECTIONS_SEARCH': 13}
Tool Calls:
... (omitted for brevity)
```

### Understanding Collections Citations

When using the collections search tool, citations follow a special URI format that uniquely identifies the source documents:

```
collections://collection_id/files/file_id
```

For example:

```
collections://collection_3be0eec8-ee8e-4a18-a9d4-fb70a3150d64/files/file_d4d1a968-9037-4caa-8eca-47a1563f28ab
```

**Format Breakdown:**

* **`collections://`**: Protocol identifier indicating this is a collection-based citation
* **`collection_id`**: The unique identifier of the collection that was searched (e.g., `collection_3be0eec8-ee8e-4a18-a9d4-fb70a3150d64`)
* **`files/`**: Path segment indicating file-level reference
* **`file_id`**: The unique identifier of the specific document file that was referenced (e.g., `file_d4d1a968-9037-4caa-8eca-47a1563f28ab`)

These citations represent all the documents from your collections that Grok referenced during its search and analysis. Each citation points to a specific file within a collection, allowing you to trace back exactly which uploaded documents contributed to the final response.

### Key Observations

1. **Autonomous Search Strategy**: Grok autonomously performs 13 different searches across the documents, progressively refining queries to find specific quarterly and annual production data.

2. **Reasoning Process**: The output shows reasoning tokens accumulating (199 → 3,352 tokens), demonstrating how the model thinks through the problem before generating the final response.

3. **Cited Sources**: All information is grounded in the uploaded documents with specific file citations, ensuring transparency and verifiability.

4. **Structured Analysis**: The final response breaks down the methodology, shows calculations, and clearly states assumptions and limitations (e.g., Q4 2025 data not yet available).

5. **Token Efficiency**: Notice the high number of cached prompt tokens (177,518) - this demonstrates how the collections search tool efficiently reuses context across multiple queries.

## Combining Collections Search with Web Search/X-Search

One of the most powerful patterns is combining the collections search tool with web search/x-search to answer questions that require both your internal knowledge base and real-time external information. This enables sophisticated analysis that grounds responses in your proprietary data while incorporating current market intelligence, news, and public sentiment.

### Example: Internal Data + Market Intelligence

Building on the Tesla example above, let's analyze how market analysts view Tesla's performance based on the production numbers from our internal documents:

```pythonXAI
import asyncio

import httpx

from xai_sdk import AsyncClient
from xai_sdk.chat import user
from xai_sdk.proto import collections_pb2
from xai_sdk.tools import code_execution, collections_search, web_search, x_search

# ... (collection creation and document upload same as before)

async def hybrid_analysis(client: AsyncClient, collection_id: str, model: str) -> None:
    # Enable collections search, web search, and code execution
    chat = client.chat.create(
        model=model,
        tools=[
            collections_search(
                collection_ids=[collection_id],
            ),
            web_search(),  # Enable web search for external data
            x_search(),  # Enable x-search for external data
            code_execution(),  # Enable code execution for calculations
        ],
        include=["verbose_streaming"],
    )

    # Ask a question that requires both internal and external information
    chat.append(
        user(
            "Based on Tesla's actual production figures in my documents (collection), what is the "
            "current market and analyst sentiment on their 2024-2025 vehicle production performance?"
        )
    )

    is_thinking = True
    async for response, chunk in chat.stream():
        for tool_call in chunk.tool_calls:
            print(f"\\nCalling tool: {tool_call.function.name} with arguments: {tool_call.function.arguments}")
        if response.usage.reasoning_tokens and is_thinking:
            print(f"\\rThinking... ({response.usage.reasoning_tokens} tokens)", end="", flush=True)
        if chunk.content and is_thinking:
            print("\\n\\nFinal Response:")
            is_thinking = False
        if chunk.content and not is_thinking:
            print(chunk.content, end="", flush=True)
        latest_response = response

    print("\\n\\nCitations:")
    print(latest_response.citations)
    print("\\n\\nTool Usage:")
    print(latest_response.server_side_tool_usage)
```

### How It Works

When you provide both `collections_search()` and `web_search()`/`x_search()` tools, Grok autonomously determines the optimal search strategy:

1. **Internal Analysis First**: Searches your uploaded Tesla SEC filings to extract actual production numbers
2. **External Context Gathering**: Performs web/x-search searches to find analyst reports, market sentiment, and production expectations
3. **Synthesis**: Combines both data sources to provide a comprehensive analysis comparing actual performance against market expectations
4. **Cited Sources**: Returns citations from both your internal documents (using `collections://` URIs) and external web sources (using `https://` URLs)

### Example Output Pattern

```output
Thinking... (201 tokens)
Calling tool: collections_search with arguments: {"query":"Tesla vehicle production figures 2024 2025","limit":20}
Thinking... (498 tokens)
Calling tool: collections_search with arguments: {"query":"Tesla quarterly vehicle production and deliveries 2024 2025","limit":20}
Thinking... (738 tokens)
Calling tool: web_search with arguments: {"query":"Tesla quarterly vehicle production and deliveries 2024 2025","num_results":10}
Thinking... (738 tokens)
Calling tool: web_search with arguments: {"query":"market and analyst sentiment Tesla vehicle production performance 2024 2025","num_results":10}
Thinking... (1280 tokens)

Final Response 
... (omitted for brevity)
```

### Use Cases for Hybrid Search

This pattern is valuable for:

* **Market Analysis**: Compare internal financial data with external market sentiment and competitor performance
* **Competitive Intelligence**: Analyze your product performance against industry reports and competitor announcements
* **Compliance Verification**: Cross-reference internal policies with current regulatory requirements and industry standards
* **Strategic Planning**: Ground business decisions in both proprietary data and real-time market conditions
* **Customer Research**: Combine internal customer data with external reviews, social sentiment, and market trends


#### Tools

# Remote MCP Tools

Remote MCP Tools allow Grok to connect to external MCP (Model Context Protocol) servers, extending its capabilities with custom tools from third parties or your own implementations. Simply specify a server URL and optional configuration - xAI manages the MCP server connection and interaction on your behalf.

## SDK Support

Remote MCP tools are supported in the xAI native SDK, the OpenAI compatible Responses API, and the [Voice Agent API](/developers/model-capabilities/audio/voice-agent#remote-mcp-tools).

> [!NOTE]
>
> The `require_approval` and `connector_id` parameters in the OpenAI Responses API are not currently supported.

## Configuration

To use remote MCP tools, you need to configure the connection to your MCP server in the tools array of your request.

| Parameter | Required | Description |
|-----------|-------------------|-------------|
| `server_url` | Yes | The URL of the MCP server to connect to. Only Streaming HTTP and SSE transports are supported. |
| `server_label` | Yes | A label to identify the server (used for tool call prefixing) |
| `server_description` | No | A description of what the server provides |
| `allowed_tools` | No | List of specific tool names to allow (empty allows all). The xAI native SDK uses the parameter name `allowed_tool_names`. |
| `authorization` | No | A token that will be set in the Authorization header on requests to the MCP server |
| `headers` | No | Additional headers to include in requests. The xAI native SDK uses the parameter name `extra_headers`. |

### Basic MCP Tool Usage

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import mcp

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        mcp(server_url="https://mcp.deepwiki.com/mcp"),
    ],
    include=["verbose_streaming"],
)

chat.append(user("What can you do with https://github.com/xai-org/xai-sdk-python?"))

is_thinking = True
for response, chunk in chat.stream():
    # View the server-side tool calls as they are being made in real-time
    for tool_call in chunk.tool_calls:
        print(f"\\nCalling tool: {tool_call.function.name} with arguments: {tool_call.function.arguments}")
    if response.usage.reasoning_tokens and is_thinking:
        print(f"\\rThinking... ({response.usage.reasoning_tokens} tokens)", end="", flush=True)
    if chunk.content and is_thinking:
        print("\\n\\nFinal Response:")
        is_thinking = False
    if chunk.content and not is_thinking:
        print(chunk.content, end="", flush=True)

print("\\n\\nUsage:")
print(response.usage)
print(response.server_side_tool_usage)
print("\\n\\nServer Side Tool Calls:")
print(response.tool_calls)
```

```pythonOpenAISDK
import os
from openai import OpenAI

api_key = os.getenv("XAI_API_KEY")
client = OpenAI(
    api_key=api_key,
    base_url="https://api.x.ai/v1",
)

response = client.responses.create(
    model="grok-4.3",
    input=[
        {
            "role": "user",
            "content": "What can you do with https://github.com/xai-org/xai-sdk-python?",
        },
    ],
    tools=[
        {
            "type": "mcp",
            "server_url": "https://mcp.deepwiki.com/mcp",
            "server_label": "deepwiki",
        }
    ],
)

print(response)
```

```pythonRequests
import os
import requests

url = "https://api.x.ai/v1/responses"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {os.getenv('XAI_API_KEY')}"
}
payload = {
    "model": "grok-4.3",
    "input": [
        {
            "role": "user",
            "content": "What can you do with https://github.com/xai-org/xai-sdk-python?"
        }
    ],
    "tools": [
        {
            "type": "mcp",
            "server_url": "https://mcp.deepwiki.com/mcp",
            "server_label": "deepwiki",
        }
    ]
}
response = requests.post(url, headers=headers, json=payload)
print(response.json())
```

```bash
curl https://api.x.ai/v1/responses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $XAI_API_KEY" \\
  -d '{
  "model": "grok-4.3",
  "input": [
    {
      "role": "user",
      "content": "What can you do with https://github.com/xai-org/xai-sdk-python?"
    }
  ],
  "tools": [
    {
        "type": "mcp",
        "server_url": "https://mcp.deepwiki.com/mcp",
        "server_label": "deepwiki"
    }
  ]
}'
```

## Tool Enablement and Access Control

When you configure a Remote MCP Tool without specifying `allowed_tools`, all tool definitions exposed by the MCP server are automatically injected into the model's context. This means the model gains access to every tool that the MCP server provides, allowing it to use any of them during the conversation.

For example, if an MCP server exposes 10 different tools and you don't specify `allowed_tools`, all 10 tool definitions will be available to the model. The model can then choose to call any of these tools based on the user's request and the tool descriptions.

Use the `allowed_tools` parameter to selectively enable only specific tools from an MCP server. This can give you several key benefits:

* **Better Performance**: Reduce context overhead by limiting tool definitions the model needs to consider
* **Reduced Risk**: For example, restrict access to tools that only perform read-only operations to prevent the model from modifying data

```pythonXAI
# Enable only specific tools from a server with many available tools
mcp(
    server_url="https://comprehensive-tools.example.com/mcp",
    allowed_tool_names=["search_database", "format_data"]
)
```

Instead of giving the model access to every tool the server offers, this approach keeps Grok focused and efficient while ensuring it has exactly the capabilities it needs.

## Multi-Server Support

Enable multiple MCP servers simultaneously to create a rich ecosystem of specialized tools:

```pythonXAI
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        mcp(server_url="https://mcp.deepwiki.com/mcp", server_label="deepwiki"),
        mcp(server_url="https://your-custom-tools.com/mcp", server_label="custom"),
        mcp(server_url="https://api.example.com/tools", server_label="api-tools"),
    ],
)
```

Each server can provide different capabilities - documentation tools, API integrations, custom business logic, or specialized data processing - all accessible within a single conversation.

## Best Practices

* **Provide clear server metadata**: Use descriptive `server_label` and `server_description` when configuring multiple MCP servers to help the model understand each server's purpose and select the right tools
* **Filter tools appropriately**: Use `allowed_tools` to restrict access to only necessary tools, especially when servers have many tools since the model must keep all available tool definitions in context
* **Use secure connections**: Always use HTTPS URLs and implement proper authentication mechanisms on your MCP server
* **Provide Examples**: While the model can generally figure out what tools to use based on the tool descriptions and the user request it may help to provide examples in the prompt

#### Tools

# Remote MCP Tools

Remote MCP Tools allow Grok to connect to external MCP (Model Context Protocol) servers, extending its capabilities with custom tools from third parties or your own implementations. Simply specify a server URL and optional configuration - xAI manages the MCP server connection and interaction on your behalf.

## SDK Support

Remote MCP tools are supported in the xAI native SDK, the OpenAI compatible Responses API, and the [Voice Agent API](/developers/model-capabilities/audio/voice-agent#remote-mcp-tools).

> [!NOTE]
>
> The `require_approval` and `connector_id` parameters in the OpenAI Responses API are not currently supported.

## Configuration

To use remote MCP tools, you need to configure the connection to your MCP server in the tools array of your request.

| Parameter | Required | Description |
|-----------|-------------------|-------------|
| `server_url` | Yes | The URL of the MCP server to connect to. Only Streaming HTTP and SSE transports are supported. |
| `server_label` | Yes | A label to identify the server (used for tool call prefixing) |
| `server_description` | No | A description of what the server provides |
| `allowed_tools` | No | List of specific tool names to allow (empty allows all). The xAI native SDK uses the parameter name `allowed_tool_names`. |
| `authorization` | No | A token that will be set in the Authorization header on requests to the MCP server |
| `headers` | No | Additional headers to include in requests. The xAI native SDK uses the parameter name `extra_headers`. |

### Basic MCP Tool Usage

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import mcp

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        mcp(server_url="https://mcp.deepwiki.com/mcp"),
    ],
    include=["verbose_streaming"],
)

chat.append(user("What can you do with https://github.com/xai-org/xai-sdk-python?"))

is_thinking = True
for response, chunk in chat.stream():
    # View the server-side tool calls as they are being made in real-time
    for tool_call in chunk.tool_calls:
        print(f"\\nCalling tool: {tool_call.function.name} with arguments: {tool_call.function.arguments}")
    if response.usage.reasoning_tokens and is_thinking:
        print(f"\\rThinking... ({response.usage.reasoning_tokens} tokens)", end="", flush=True)
    if chunk.content and is_thinking:
        print("\\n\\nFinal Response:")
        is_thinking = False
    if chunk.content and not is_thinking:
        print(chunk.content, end="", flush=True)

print("\\n\\nUsage:")
print(response.usage)
print(response.server_side_tool_usage)
print("\\n\\nServer Side Tool Calls:")
print(response.tool_calls)
```

```pythonOpenAISDK
import os
from openai import OpenAI

api_key = os.getenv("XAI_API_KEY")
client = OpenAI(
    api_key=api_key,
    base_url="https://api.x.ai/v1",
)

response = client.responses.create(
    model="grok-4.3",
    input=[
        {
            "role": "user",
            "content": "What can you do with https://github.com/xai-org/xai-sdk-python?",
        },
    ],
    tools=[
        {
            "type": "mcp",
            "server_url": "https://mcp.deepwiki.com/mcp",
            "server_label": "deepwiki",
        }
    ],
)

print(response)
```

```pythonRequests
import os
import requests

url = "https://api.x.ai/v1/responses"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {os.getenv('XAI_API_KEY')}"
}
payload = {
    "model": "grok-4.3",
    "input": [
        {
            "role": "user",
            "content": "What can you do with https://github.com/xai-org/xai-sdk-python?"
        }
    ],
    "tools": [
        {
            "type": "mcp",
            "server_url": "https://mcp.deepwiki.com/mcp",
            "server_label": "deepwiki",
        }
    ]
}
response = requests.post(url, headers=headers, json=payload)
print(response.json())
```

```bash
curl https://api.x.ai/v1/responses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $XAI_API_KEY" \\
  -d '{
  "model": "grok-4.3",
  "input": [
    {
      "role": "user",
      "content": "What can you do with https://github.com/xai-org/xai-sdk-python?"
    }
  ],
  "tools": [
    {
        "type": "mcp",
        "server_url": "https://mcp.deepwiki.com/mcp",
        "server_label": "deepwiki"
    }
  ]
}'
```

## Tool Enablement and Access Control

When you configure a Remote MCP Tool without specifying `allowed_tools`, all tool definitions exposed by the MCP server are automatically injected into the model's context. This means the model gains access to every tool that the MCP server provides, allowing it to use any of them during the conversation.

For example, if an MCP server exposes 10 different tools and you don't specify `allowed_tools`, all 10 tool definitions will be available to the model. The model can then choose to call any of these tools based on the user's request and the tool descriptions.

Use the `allowed_tools` parameter to selectively enable only specific tools from an MCP server. This can give you several key benefits:

* **Better Performance**: Reduce context overhead by limiting tool definitions the model needs to consider
* **Reduced Risk**: For example, restrict access to tools that only perform read-only operations to prevent the model from modifying data

```pythonXAI
# Enable only specific tools from a server with many available tools
mcp(
    server_url="https://comprehensive-tools.example.com/mcp",
    allowed_tool_names=["search_database", "format_data"]
)
```

Instead of giving the model access to every tool the server offers, this approach keeps Grok focused and efficient while ensuring it has exactly the capabilities it needs.

## Multi-Server Support

Enable multiple MCP servers simultaneously to create a rich ecosystem of specialized tools:

```pythonXAI
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        mcp(server_url="https://mcp.deepwiki.com/mcp", server_label="deepwiki"),
        mcp(server_url="https://your-custom-tools.com/mcp", server_label="custom"),
        mcp(server_url="https://api.example.com/tools", server_label="api-tools"),
    ],
)
```

Each server can provide different capabilities - documentation tools, API integrations, custom business logic, or specialized data processing - all accessible within a single conversation.

## Best Practices

* **Provide clear server metadata**: Use descriptive `server_label` and `server_description` when configuring multiple MCP servers to help the model understand each server's purpose and select the right tools
* **Filter tools appropriately**: Use `allowed_tools` to restrict access to only necessary tools, especially when servers have many tools since the model must keep all available tool definitions in context
* **Use secure connections**: Always use HTTPS URLs and implement proper authentication mechanisms on your MCP server
* **Provide Examples**: While the model can generally figure out what tools to use based on the tool descriptions and the user request it may help to provide examples in the prompt


#### Tools

# Streaming & Synchronous Requests

Agentic requests can be executed in either streaming or synchronous mode. This page covers both approaches and how to use them effectively.

## Streaming Mode (Recommended)

We strongly recommend using streaming mode when using agentic tool calling. It provides:

* **Real-time observability** of tool calls as they happen
* **Immediate feedback** during potentially long-running requests
* **Reasoning token counts** as the model thinks

### Streaming Example

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import code_execution, web_search, x_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        web_search(),
        x_search(),
        code_execution(),
    ],
    include=["verbose_streaming"],
)

chat.append(user("What are the latest updates from xAI?"))

is_thinking = True
for response, chunk in chat.stream():
    # View server-side tool calls in real-time
    for tool_call in chunk.tool_calls:
        print(f"\\nCalling tool: {tool_call.function.name}")
    if response.usage.reasoning_tokens and is_thinking:
        print(f"\\rThinking... ({response.usage.reasoning_tokens} tokens)", end="", flush=True)
    if chunk.content and is_thinking:
        print("\\n\\nFinal Response:")
        is_thinking = False
    if chunk.content and not is_thinking:
        print(chunk.content, end="", flush=True)

print("\\nCitations:", response.citations)
```

```javascriptAISDK
import { xai } from '@ai-sdk/xai';
import { streamText } from 'ai';

const { fullStream } = streamText({
  model: xai.responses('grok-4.3'),
  prompt: 'What are the latest updates from xAI?',
  tools: {
    web_search: xai.tools.webSearch(),
    x_search: xai.tools.xSearch(),
    code_execution: xai.tools.codeExecution(),
  },
});

for await (const part of fullStream) {
  if (part.type === 'tool-call') {
    console.log(\`Calling tool: \${part.toolName}\`);
  } else if (part.type === 'text-delta') {
    process.stdout.write(part.text);
  } else if (part.type === 'source' && part.sourceType === 'url') {
    console.log(\`Citation: \${part.url}\`);
  }
}
```

## Synchronous Mode

For simpler use cases or when you want to wait for the complete agentic workflow to finish before processing the response, you can use synchronous requests:

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import code_execution, web_search, x_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        web_search(),
        x_search(),
        code_execution(),
    ],
)

chat.append(user("What is the latest update from xAI?"))

# Get the final response in one go once it's ready
response = chat.sample()

print("Final Response:")
print(response.content)

print("\\nCitations:")
print(response.citations)

print("\\nUsage:")
print(response.usage)
print(response.server_side_tool_usage)
```

```javascriptAISDK
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';

// Synchronous request - waits for complete response
const { text, sources } = await generateText({
  model: xai.responses('grok-4.3'),
  prompt: 'What is the latest update from xAI?',
  tools: {
    web_search: xai.tools.webSearch(),
    x_search: xai.tools.xSearch(),
    code_execution: xai.tools.codeExecution(),
  },
});

console.log('Final Response:');
console.log(text);

console.log('\\nCitations:');
console.log(sources);
```

Synchronous requests will wait for the entire agentic process to complete before returning. This is simpler for basic use cases but provides less visibility into intermediate steps.

## Using Tools with Responses API

We also support using the Responses API in both streaming and non-streaming modes:

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import web_search, x_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",
    store_messages=True,  # Enable Responses API
    tools=[
        web_search(),
        x_search(),
    ],
)

chat.append(user("What is the latest update from xAI?"))
response = chat.sample()

print(response.content)
print(response.citations)

# The response id can be used to continue the conversation
print(response.id)
```

```pythonOpenAISDK
import os
from openai import OpenAI

api_key = os.getenv("XAI_API_KEY")
client = OpenAI(
    api_key=api_key,
    base_url="https://api.x.ai/v1",
)

response = client.responses.create(
    model="grok-4.3",
    input=[
        {
            "role": "user",
            "content": "what is the latest update from xAI?",
        },
    ],
    tools=[
        {
            "type": "web_search",
        },
        {
            "type": "x_search",
        },
    ],
)

print(response)
```

```bash
curl https://api.x.ai/v1/responses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $XAI_API_KEY" \\
  -d '{
  "model": "grok-4.3",
  "input": [
    {
      "role": "user",
      "content": "what is the latest update from xAI?"
    }
  ],
  "tools": [
    {
      "type": "web_search"
    },
    {
      "type": "x_search"
    }
  ]
}'
```

## Accessing Tool Outputs

By default, server-side tool call outputs are not returned since they can be large. However, you can opt-in to receive them:

### xAI SDK

| Tool | Value for `include` field |
|------|---------------------------|
| `"web_search"` | `"web_search_call_output"` |
| `"x_search"` | `"x_search_call_output"` |
| `"code_execution"` | `"code_execution_call_output"` |
| `"collections_search"` | `"collections_search_call_output"` |
| `"attachment_search"` | `"attachment_search_call_output"` |
| `"mcp"` | `"mcp_call_output"` |

```pythonXAI
import os
from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import code_execution

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        code_execution(),
    ],
    include=["code_execution_call_output"],
)
chat.append(user("What is the 100th Fibonacci number?"))

# stream or sample the response...
```

### Responses API

| Tool | Responses API tool name | Value for `include` field |
|------|-------------------------|---------------------------|
| `"web_search"` | `"web_search"` | `"web_search_call.action.sources"` |
| `"code_execution"` | `"code_interpreter"` | `"code_interpreter_call.outputs"` |
| `"collections_search"` | `"file_search"` | `"file_search_call.results"` |
| `"mcp"` | `"mcp"` | Always returned in Responses API |


#### Tools

# Tool Usage Details

This page covers the technical details of how tool calls are tracked, billed, and how to understand token usage in agentic requests.

## Real-time Server-side Tool Calls

When streaming agentic requests, you can observe **every tool call decision** the model makes in real-time via the `tool_calls` attribute on the `chunk` object:

```pythonWithoutSDK
for tool_call in chunk.tool_calls:
    print(f"\nCalling tool: {tool_call.function.name} with arguments: {tool_call.function.arguments}")
```

**Note**: Only the tool call invocations are shown — **server-side tool call outputs are not returned** in the API response. The agent uses these outputs internally to formulate its final response.

## Server-side Tool Calls vs Tool Usage

The API provides two related but distinct metrics for server-side tool executions:

### `tool_calls` - All Attempted Calls

```pythonWithoutSDK
response.tool_calls
```

Returns a list of all **attempted** tool calls made during the agentic process. Each entry contains:

* `id`: Unique identifier for the tool call
* `function.name`: The name of the specific server-side tool called
* `function.arguments`: The parameters passed to the server-side tool

This includes **every tool call attempt**, even if some fail.

### `server_side_tool_usage` - Successful Calls (Billable)

```pythonWithoutSDK
response.server_side_tool_usage
```

Returns a map of successfully executed tools and their invocation counts. This represents only the tool calls that returned meaningful responses and **determines your billing**.

```output
{'SERVER_SIDE_TOOL_X_SEARCH': 3, 'SERVER_SIDE_TOOL_WEB_SEARCH': 2}
```

## Tool Call Function Names vs Usage Categories

In xAI SDK chat responses, the function names in `tool_calls` represent the precise name of the tool invoked, while the entries in `server_side_tool_usage` provide a high-level categorization that aligns with the original tool passed in the `tools` array. In the Responses API, Web Search activity is represented as `web_search_call` output items instead.

| Usage Category | Function Name(s) |
|----------------|------------------|
| `SERVER_SIDE_TOOL_WEB_SEARCH` | `web_search`, `web_search_with_snippets`, `browse_page`, `open_page`, `open_page_with_find` |
| `SERVER_SIDE_TOOL_IMAGE_SEARCH` | `search_images` |
| `SERVER_SIDE_TOOL_X_SEARCH` | `x_user_search`, `x_keyword_search`, `x_semantic_search`, `x_thread_fetch` |
| `SERVER_SIDE_TOOL_CODE_EXECUTION` | `code_execution` |
| `SERVER_SIDE_TOOL_VIEW_X_VIDEO` | `view_x_video` |
| `SERVER_SIDE_TOOL_VIEW_IMAGE` | `view_image` |
| `SERVER_SIDE_TOOL_COLLECTIONS_SEARCH` | `collections_search` |
| `SERVER_SIDE_TOOL_MCP` | `{server_label}.{tool_name}` if `server_label` provided, otherwise `{tool_name}` |

## When Tool Calls and Usage Differ

In most cases, `tool_calls` and `server_side_tool_usage` will show the same tools. However, they can differ when:

* **Failed tool executions**: The model attempts to browse a non-existent webpage, fetch a deleted X post, or encounters other execution errors
* **Invalid parameters**: Tool calls with malformed arguments that can't be processed
* **Network or service issues**: Temporary failures in the tool execution pipeline

The agentic system handles these failures gracefully, updating its trajectory and continuing with alternative approaches when needed.

**Billing Note**: Only successful tool executions (`server_side_tool_usage`) are billed. Failed attempts are not charged.

## Understanding Token Usage

Agentic requests have unique token usage patterns compared to standard chat completions:

### `completion_tokens`

Represents **only the final text output** of the model. This is typically much smaller than you might expect, as the agent performs all its intermediate reasoning and tool orchestration internally.

### `prompt_tokens`

Represents the **cumulative input tokens** across all inference requests made during the agentic process. Each request includes the full conversation history up to that point, which grows as the agent progresses.

While this can result in higher `prompt_tokens` counts, agentic requests benefit significantly from **prompt caching**. The majority of the prompt remains unchanged between steps, allowing for efficient caching.

### `reasoning_tokens`

Represents the tokens used for the model's internal reasoning process. This includes planning tool calls, analyzing results, and formulating responses, but excludes the final output tokens.

### `cached_prompt_text_tokens`

Indicates how many prompt tokens were served from cache rather than recomputed. Higher values indicate better cache utilization and lower costs.

### `prompt_image_tokens`

Represents tokens from visual content that the agent processes. These are counted separately from text tokens. If no images or videos are processed, this value will be zero.

## Limiting Tool Call Turns

The `max_turns` parameter allows you to control the maximum number of assistant/tool-call turns the agent can perform during a single request.

### Understanding Turns vs Tool Calls

**Important**: `max_turns` does **not** directly limit the number of individual tool calls. Instead, it limits the number of assistant turns in the agentic loop. During a single turn, the model may invoke multiple tools in parallel.

A "turn" represents one iteration of the agentic reasoning loop:

1. The model analyzes the current context
2. The model decides to call one or more tools (potentially in parallel)
3. Tools execute and return results
4. The model processes the results

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import web_search, x_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",
    tools=[
        web_search(),
        x_search(),
    ],
    max_turns=3,  # Limit to 3 assistant/tool-call turns
)

chat.append(user("What is the latest news from xAI?"))
response = chat.sample()
print(response.content)
```

### When to Use `max_turns`

| Use Case | Recommended `max_turns` | Tradeoff |
|----------|------------------------|----------|
| **Quick lookups** | 1-2 | Fastest response, may miss deeper insights |
| **Balanced research** | 3-5 | Good balance of speed and thoroughness |
| **Deep research** | 10+ or unset | Most comprehensive, longer latency and higher cost |

### Default Behavior

If `max_turns` is not specified, the server applies a global default cap. When the agent reaches the limit, it will stop making additional tool calls and generate a final response based on information gathered so far.

## Identifying Tool Call Types

To determine whether a returned tool call is a client-side tool that needs local execution:

### Using xAI SDK

Use the `get_tool_call_type` function:

```pythonXAI
from xai_sdk.tools import get_tool_call_type

for tool_call in response.tool_calls:
    print(get_tool_call_type(tool_call))
```

| Tool call types | Description |
|---------------|-------------|
| `"client_side_tool"` | Client-side tool call - requires local execution |
| `"web_search_tool"` | Web-search tool - handled by xAI server |
| `"x_search_tool"` | X-search tool - handled by xAI server |
| `"code_execution_tool"` | Code-execution tool - handled by xAI server |
| `"collections_search_tool"` | Collections-search tool - handled by xAI server |
| `"mcp_tool"` | MCP tool - handled by xAI server |

### Using Responses API

Check the `type` field of output entries (`response.output[].type`):

| Types | Description |
|-------|-------------|
| `"function_call"` | Client-side tool - requires local execution |
| `"web_search_call"` | Web-search tool - handled by xAI server |
| `"x_search_call"` | X-search tool - handled by xAI server |
| `"code_interpreter_call"` | Code-execution tool - handled by xAI server |
| `"file_search_call"` | Collections-search tool - handled by xAI server |
| `"mcp_call"` | MCP tool - handled by xAI server |


#### Tools

# Advanced Usage

In this section, we explore advanced usage patterns for agentic tool calling, including:

* **[Use Client-side Tools](#mixing-server-side-and-client-side-tools)** - Combine server-side agentic tools with your own client-side tools for specialized functionality that requires local execution.
* **[Multi-turn Conversations](#multi-turn-conversations-with-preservation-of-agentic-state)** - Maintain context across multiple turns in agentic tool-enabled conversations, allowing the model to build upon previous research and tool results for more complex, iterative problem-solving
* **[Requests with Multiple Active Tools](#tool-combinations)** - Send requests with multiple server-side tools active simultaneously, enabling comprehensive analysis with web search, X search, and code execution tools working together
* **[Image Integration](#using-images-in-the-context)** - Include images in your tool-enabled conversations for visual analysis and context-aware searches

> [!NOTE]
>
> &#x20;Advanced tool usage patterns are not yet supported in the Vercel AI SDK. Please use the xAI SDK or OpenAI SDK for this functionality.

## Mixing Server-Side and Client-Side Tools

You can combine server-side agentic tools (like web search and code execution) with custom client-side tools to create powerful hybrid workflows. This approach lets you leverage the model's reasoning capabilities with server-side tools while adding specialized functionality that runs locally in your application.

### How It Works

The key difference when mixing server-side and client-side tools is that **server-side tools are executed automatically by xAI**, while **client-side tools require developer intervention**:

1. Define your client-side tools using [standard function calling patterns](/developers/tools/function-calling)
2. Include both server-side and client-side tools in your request
3. **xAI automatically executes any server-side tools** the model decides to use (web search, code execution, etc.)
4. **When the model calls client-side tools, execution pauses** - xAI returns the tool calls to you instead of executing them
5. **Detect and execute client-side tool calls yourself**, then append the results back to continue the conversation
6. **Repeat this process** until the model generates a final response with no additional client-side tool calls

### Understanding `max_turns` with Client-Side Tools

When using [the `max_turns` parameter](/developers/tools/tool-usage-details#limiting-tool-call-turns) with mixed server-side and client-side tools, it's important to understand that **`max_turns` only limits the assistant/server-side tool call turns within a single request**.

When the model decides to invoke a client-side tool, the agent execution **pauses and yields control back to your application**. This means:

* The current request completes, and you receive the client-side tool call(s) to execute
* After you execute the client-side tool and append the result, you make a **new follow-up request**
* This follow-up request starts with a fresh `max_turns` count

In other words, client-side tool invocations act as "checkpoints" that reset the turn counter. If you set `max_turns=5` and the agent performs 3 server-side tool calls before requesting a client-side tool, the subsequent request (after you provide the client-side tool result) will again allow up to 5 server-side tool turns.

### Practical Example

Given a local client-side function `get_weather` to get the weather of a specified city, the model can use this client-side tool and the web-search tool to determine the weather in the base city of the 2025 NBA champion.

### Using the xAI SDK

You can determine whether a tool call is a client-side tool call by using `xai_sdk.tools.get_tool_call_type` against a tool call from the `response.tool_calls` list.
For more details, check [Identifying Tool Call Types](/developers/tools/tool-usage-details#identifying-tool-call-types).

1. Import the dependencies, and define the client-side tool.

   ```pythonXAI
   import os
   import json

   from xai_sdk import Client
   from xai_sdk.chat import user, tool, tool_result
   from xai_sdk.tools import web_search, get_tool_call_type

   client = Client(api_key=os.getenv("XAI_API_KEY"))

   # Define client-side tool
   def get_weather(city: str) -> str:
       """Get the weather for a given city."""
       # In a real app, this would query your database
       return f"The weather in {city} is sunny."

   # Tools array with both server-side and client-side tools
   tools = [
       web_search(),
       tool(
           name="get_weather",
           description="Get the weather for a given city.",
           parameters={
               "type": "object",
               "properties": {
                   "city": {
                       "type": "string",
                       "description": "The name of the city",
                   }
               },
               "required": ["city"]
           },
       ),
   ]

   model = "grok-4.3"
   ```

2. Perform the tool loop with conversation continuation:
   * You can either use `previous_response_id` to continue the conversation from the last response.

     ```pythonXAI
     # Create chat with both server-side and client-side tools
     chat = client.chat.create(
         model=model,
         tools=tools,
         store_messages=True,
     )
     chat.append(
         user(
             "What is the weather in the base city of the team that won the "
             "2025 NBA championship?"
         )
     )

     while True:
         client_side_tool_calls = []
         for response, chunk in chat.stream():
             for tool_call in chunk.tool_calls:
                 if get_tool_call_type(tool_call) == "client_side_tool":
                     client_side_tool_calls.append(tool_call)
                 else:
                     print(
                         f"Server-side tool call: {tool_call.function.name} "
                         f"with arguments: {tool_call.function.arguments}"
                     )

         if not client_side_tool_calls:
             break

         chat = client.chat.create(
             model=model,
             tools=tools,
             store_messages=True,
             previous_response_id=response.id,
         )

         for tool_call in client_side_tool_calls:
             print(
                 f"Client-side tool call: {tool_call.function.name} "
                 f"with arguments: {tool_call.function.arguments}"
             )
             args = json.loads(tool_call.function.arguments)
             result = get_weather(args["city"])
             chat.append(tool_result(result))

     print(f"Final response: {response.content}")
     ```

   * Alternatively, you can use the encrypted content to continue the conversation.

     ```pythonXAI
     # Create chat with both server-side and client-side tools
     chat = client.chat.create(
         model=model,
         tools=tools,
         use_encrypted_content=True,
     )
     chat.append(
         user(
             "What is the weather in the base city of the team that won the "
             "2025 NBA championship?"
         )
     )

     while True:
         client_side_tool_calls = []
         for response, chunk in chat.stream():
             for tool_call in chunk.tool_calls:
                 if get_tool_call_type(tool_call) == "client_side_tool":
                     client_side_tool_calls.append(tool_call)
                 else:
                     print(
                         f"Server-side tool call: {tool_call.function.name} "
                         f"with arguments: {tool_call.function.arguments}"
                     )

         chat.append(response)

         if not client_side_tool_calls:
             break

         for tool_call in client_side_tool_calls:
             print(
                 f"Client-side tool call: {tool_call.function.name} "
                 f"with arguments: {tool_call.function.arguments}"
             )
             args = json.loads(tool_call.function.arguments)
             result = get_weather(args["city"])
             chat.append(tool_result(result))

     print(f"Final response: {response.content}")
     ```

You will see an output similar to the following:

```
Server-side tool call: web_search with arguments: {"query":"Who won the 2025 NBA championship?","num_results":5}
Client-side tool call: get_weather with arguments: {"city":"Oklahoma City"}
Final response: The Oklahoma City Thunder won the 2025 NBA championship. The current weather in Oklahoma City is sunny.
```

### Using the OpenAI SDK

You can determine whether a tool call is a client-side tool call by checking the `type` field of an output entry from the `response.output` list.
For more details, see [Identifying Tool Call Types](/developers/tools/tool-usage-details#identifying-tool-call-types).

1. Import the dependencies, and define the client-side tool.

   ```pythonOpenAISDK
   import os
   import json

   from openai import OpenAI

   client = OpenAI(
       api_key=os.getenv("XAI_API_KEY"),
       base_url="https://api.x.ai/v1",
   )

   # Define client-side tool
   def get_weather(city: str) -> str:
       """Get the weather for a given city."""
       # In a real app, this would query your database
       return f"The weather in {city} is sunny."

   model = "grok-4.3"
   tools = [
       {
           "type": "function",
           "name": "get_weather",
           "description": "Get the weather for a given city.",
           "parameters": {
               "type": "object",
               "properties": {
                   "city": {
                       "type": "string",
                       "description": "The name of the city",
                   },
               },
               "required": ["city"],
           },
       },
       {
           "type": "web_search",
       },
   ]
   ```

2. Perform the tool loop:

   * You can either use `previous_response_id`.

     ```pythonOpenAISDK
     response = client.responses.create(
         model=model,
         input=(
             "What is the weather in the base city of the team that won the "
             "2025 NBA championship?"
         ),
         tools=tools,
     )

     while True:
         tool_outputs = []
         for item in response.output:
             if item.type == "function_call":
                 print(f"Client-side tool call: {item.name} with arguments: {item.arguments}")
                 args = json.loads(item.arguments)
                 weather = get_weather(args["city"])
                 tool_outputs.append(
                     {
                         "type": "function_call_output",
                         "call_id": item.call_id,
                         "output": weather,
                     }
                 )
             elif item.type in (
                 "web_search_call",
                 "x_search_call", 
                 "code_interpreter_call",
                 "file_search_call",
                 "mcp_call"
             ):
                 print(
                     f"Server-side tool call: {item.name} with arguments: {item.arguments}"
                 )

         if not tool_outputs:
             break

         response = client.responses.create(
             model=model,
             tools=tools,
             input=tool_outputs,
             previous_response_id=response.id,
         )

     print("Final response:", response.output[-1].content[0].text)
     ```

   * or using the encrypted content

     ```pythonOpenAISDK
     input_list = [
         {
             "role": "user",
             "content": (
                 "What is the weather in the base city of the team that won the "
                 "2025 NBA championship?"
             ),
         }
     ]

     response = client.responses.create(
         model=model,
         input=input_list,
         tools=tools,
         include=["reasoning.encrypted_content"],
     )

     while True:
         input_list.extend(response.output)
         tool_outputs = []
         for item in response.output:
             if item.type == "function_call":
                 print(f"Client-side tool call: {item.name} with arguments: {item.arguments}")
                 args = json.loads(item.arguments)
                 weather = get_weather(args["city"])
                 tool_outputs.append(
                     {
                         "type": "function_call_output",
                         "call_id": item.call_id,
                         "output": weather,
                     }
                 )
             elif item.type in (
                 "web_search_call",
                 "x_search_call", 
                 "code_interpreter_call",
                 "file_search_call",
                 "mcp_call"
             ):
                 print(
                     f"Server-side tool call: {item.name} with arguments: {item.arguments}"
                 )

         if not tool_outputs:
             break

         input_list.extend(tool_outputs)
         response = client.responses.create(
             model=model,
             input=input_list,
             tools=tools,
             include=["reasoning.encrypted_content"],
         )

     print("Final response:", response.output[-1].content[0].text)
     ```

## Multi-turn Conversations with Preservation of Agentic State

When using agentic tools, you may want multi-turn conversations where follow-up prompts maintain all agentic state, including the full history of reasoning, tool calls, and tool responses. The stateful API makes this possible by preserving conversation context across multiple interactions. Two options are outlined below.

### Store the Conversation History Remotely

You can choose to store the conversation history remotely on the xAI server, and every time you want to continue the conversation, you can pick up from the last response where you want to resume from.

There are only 2 extra steps:

1. Add the parameter `store_messages=True` when making the first agentic request. This tells the service to store the entire conversation history on xAI servers, including the model's reasoning, server-side tool calls, and corresponding responses.
2. Pass `previous_response_id=response.id` when creating the follow-up conversation, where `response` is the response returned by `chat.sample()` or `chat.stream()` from the conversation that you wish to continue.

Note that the follow-up conversation does not need to use the same tools, model parameters, or any other configuration as the initial conversation—it will still be fully hydrated with the complete agentic state from the previous interaction.

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import web_search, x_search
client = Client(api_key=os.getenv("XAI_API_KEY"))
# First turn.
chat = client.chat.create(
    model="grok-4.3",  # reasoning model
    tools=[web_search(), x_search()],
    store_messages=True,
)
chat.append(user("What is xAI?"))
print("\\n\\n##### First turn #####\\n")
for response, chunk in chat.stream():
    print(chunk.content, end="", flush=True)
print("\\n\\nUsage for first turn:", response.server_side_tool_usage)

# Second turn.
chat = client.chat.create(
    model="grok-4.3",  # reasoning model
    tools=[web_search(), x_search()],
    # pass the response id of the first turn to continue the conversation
    previous_response_id=response.id,
)

chat.append(user("What is its latest mission?"))
print("\\n\\n##### Second turn #####\\n")
for response, chunk in chat.stream():
    print(chunk.content, end="", flush=True)
print("\\n\\nUsage for second turn:", response.server_side_tool_usage)
```

### Append the Encrypted Agentic Tool Calling States

There is another option for the ZDR (Zero Data Retention) users, or the users who don't want to use the above option, that is to let the xAI server also return
the encrypted reasoning and the encrypted tool output besides the final content to the client side, and those encrypted contents can be included as a part of the context
in the next turn conversation.

Here are the extra steps you need to take for this option:

1. Add the parameter `use_encrypted_content=True` when making the first agentic request. This tells the service to return the entire conversation history to the client side, including the model's reasoning (encrypted), server-side tool calls, and corresponding responses (encrypted).
2. Append the response to the conversation you wish to continue before making the call to `chat.sample()` or `chat.stream()`.

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import web_search, x_search
client = Client(api_key=os.getenv("XAI_API_KEY"))
# First turn.
chat = client.chat.create(
    model="grok-4.3",  # reasoning model
    tools=[web_search(), x_search()],
    use_encrypted_content=True,
)
chat.append(user("What is xAI?"))
print("\\n\\n##### First turn #####\\n")
for response, chunk in chat.stream():
    print(chunk.content, end="", flush=True)
print("\\n\\nUsage for first turn:", response.server_side_tool_usage)

chat.append(response)

print("\\n\\n##### Second turn #####\\n")
chat.append(user("What is its latest mission?"))
# Second turn.
for response, chunk in chat.stream():
    print(chunk.content, end="", flush=True)
print("\\n\\nUsage for second turn:", response.server_side_tool_usage)
```

For more details about stateful responses, please check out [this guide](/developers/model-capabilities/text/generate-text).

## Tool Combinations

Equipping your requests with multiple tools is straightforward—simply include the tools you want to activate in the `tools` array of your request. The model will intelligently orchestrate between them based on the task at hand.

### Suggested Tool Combinations

Here are some common patterns for combining tools, depending on your use case:

| If you're trying to... | Consider activating... | Because... |
|------------------------|----------------------|------------|
| **Research & analyze data** | Web Search + Code Execution | Web search gathers information, code execution analyzes and visualizes it |
| **Aggregate news & social media** | Web Search + X Search | Get comprehensive coverage from both traditional web and social platforms |
| **Extract insights from multiple sources** | Web Search + X Search + Code Execution | Collect data from various sources then compute correlations and trends |
| **Monitor real-time discussions** | X Search + Web Search | Track social sentiment alongside authoritative information |

```pythonXAI
from xai_sdk.tools import web_search, x_search, code_execution

# Example tool combinations for different scenarios
research_setup = [web_search(), code_execution()]
news_setup = [web_search(), x_search()]
comprehensive_setup = [web_search(), x_search(), code_execution()]
```

```pythonWithoutSDK
research_setup = {
  "tools": [
    {"type": "web_search"},
    {"type": "code_interpreter"}
  ]
}

news_setup = {
  "tools": [
    {"type": "web_search"},
    {"type": "x_search"}
  ]
}

comprehensive_setup = {
  "tools": [
    {"type": "web_search"},
    {"type": "x_search"},
    {"type": "code_interpreter"}
  ]
}
```

### Using Tool Combinations in Different Scenarios

1. When you want to search for news on the Internet, you can activate all search tools:
   * Web search tool
   * X search tool

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import web_search, x_search

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",  # reasoning model
    tools=[
        web_search(),
        x_search(),
    ],
    include=["verbose_streaming"],
)

chat.append(user("what is the latest update from xAI?"))

is_thinking = True
for response, chunk in chat.stream():
    # View the server-side tool calls as they are being made in real-time
    for tool_call in chunk.tool_calls:
        print(f"\\nCalling tool: {tool_call.function.name} with arguments: {tool_call.function.arguments}")
    if response.usage.reasoning_tokens and is_thinking:
        print(f"\\rThinking... ({response.usage.reasoning_tokens} tokens)", end="", flush=True)
    if chunk.content and is_thinking:
        print("\\n\\nFinal Response:")
        is_thinking = False
    if chunk.content and not is_thinking:
        print(chunk.content, end="", flush=True)

print("\\n\\nCitations:")
print(response.citations)
print("\\n\\nUsage:")
print(response.usage)
print(response.server_side_tool_usage)
print("\\n\\nServer Side Tool Calls:")
print(response.tool_calls)
```

```pythonOpenAISDK
import os
from openai import OpenAI

api_key = os.getenv("XAI_API_KEY")
client = OpenAI(
    api_key=api_key,
    base_url="https://api.x.ai/v1",
)

response = client.responses.create(
    model="grok-4.3",
    input=[
        {
            "role": "user",
            "content": "what is the latest update from xAI?",
        },
    ],
    tools=[
        {
            "type": "web_search",
        },
        {
            "type": "x_search",
        },
    ],
)

print(response)
```

```pythonRequests
import os
import requests

url = "https://api.x.ai/v1/responses"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {os.getenv('XAI_API_KEY')}"
}
payload = {
    "model": "grok-4.3",
    "input": [
        {
            "role": "user",
            "content": "what is the latest update from xAI?"
        }
    ],
    "tools": [
        {
            "type": "web_search",
        },
        {
            "type": "x_search",
        }
    ]
}
response = requests.post(url, headers=headers, json=payload)
print(response.json())
```

```bash
curl https://api.x.ai/v1/responses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $XAI_API_KEY" \\
  -d '{
  "model": "grok-4.3",
  "input": [
    {
      "role": "user",
      "content": "What is the latest update from xAI?"
    }
  ],
  "tools": [
    {
      "type": "web_search"
    },
    {
      "type": "x_search"
    }
  ]
}'
```

2. When you want to collect up-to-date data from the Internet and perform calculations based on the Internet data, you can choose to activate:
   * Web search tool
   * Code execution tool

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import web_search, code_execution

client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",  # reasoning model
    # research_tools
    tools=[
        web_search(),
        code_execution(),
    ],
    include=["verbose_streaming"],
)

chat.append(user("What is the average market cap of the companies with the top 5 market cap in the US stock market today?"))

# sample or stream the response...
```

```pythonOpenAISDK
import os
from openai import OpenAI

api_key = os.getenv("XAI_API_KEY")
client = OpenAI(
    api_key=api_key,
    base_url="https://api.x.ai/v1",
)

response = client.responses.create(
    model="grok-4.3",
    input=[
        {
            "role": "user",
            "content": "What is the average market cap of the companies with the top 5 market cap in the US stock market today?",
        },
    ],
    # research_tools
    tools=[
        {
            "type": "web_search",
        },
        {
            "type": "code_interpreter",
        },
    ],
)

print(response)
```

```pythonRequests
import os
import requests

url = "https://api.x.ai/v1/responses"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {os.getenv('XAI_API_KEY')}"
}
payload = {
    "model": "grok-4.3",
    "input": [
        {
            "role": "user",
            "content": "What is the average market cap of the companies with the top 5 market cap in the US stock market today?"
        }
    ],
    # research_tools
    "tools": [
        {
            "type": "web_search",
        },
        {
            "type": "code_interpreter",
        },
    ]
}
response = requests.post(url, headers=headers, json=payload)
print(response.json())
```

```bash
curl https://api.x.ai/v1/responses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $XAI_API_KEY" \\
  -d '{
  "model": "grok-4.3",
  "input": [
    {
      "role": "user",
      "content": "What is the average market cap of the companies with the top 5 market cap in the US stock market today?"
    }
  ],
  "tools": [
    {
      "type": "web_search"
    },
    {
      "type": "code_interpreter"
    }
  ]
}'
```

## Using Images in the Context

You can bootstrap your requests with an initial conversation context that includes images.

In the code sample below, we pass an image into the context of the conversation before initiating an agentic request.

```pythonXAI
import os

from xai_sdk import Client
from xai_sdk.chat import image, user
from xai_sdk.tools import web_search, x_search

# Create the client and define the server-side tools to use
client = Client(api_key=os.getenv("XAI_API_KEY"))
chat = client.chat.create(
    model="grok-4.3",  # reasoning model
    tools=[web_search(), x_search()],
    include=["verbose_streaming"],
)

# Add an image to the conversation
chat.append(
    user(
        "Search the internet and tell me what kind of dog is in the image below.",
        "And what is the typical lifespan of this dog breed?",
        image(
            "https://pbs.twimg.com/media/G3B7SweXsAAgv5N?format=jpg&name=900x900"
        ),
    )
)

is_thinking = True
for response, chunk in chat.stream():
    # View the server-side tool calls as they are being made in real-time
    for tool_call in chunk.tool_calls:
        print(f"\\nCalling tool: {tool_call.function.name} with arguments: {tool_call.function.arguments}")
    if response.usage.reasoning_tokens and is_thinking:
        print(f"\\rThinking... ({response.usage.reasoning_tokens} tokens)", end="", flush=True)
    if chunk.content and is_thinking:
        print("\\n\\nFinal Response:")
        is_thinking = False
    if chunk.content and not is_thinking:
        print(chunk.content, end="", flush=True)

print("\\n\\nCitations:")
print(response.citations)
print("\\n\\nUsage:")
print(response.usage)
print(response.server_side_tool_usage)
print("\\n\\nServer Side Tool Calls:")
print(response.tool_calls)
```
