import type { Client } from '@modelcontextprotocol/client';
import { HarnessError } from '@deepseek-ai/dsh-llm';

export type CatalogTool = Awaited<ReturnType<Client['listTools']>>['tools'][number];

export interface PublicTool {
  upstream: CatalogTool;
  inputSchema: Record<string, unknown>;
  description: string;
  allowedKeys: ReadonlySet<string>;
}

export const PUBLIC_TOOL_NAMES = [
  'ustc_semester_list',
  'ustc_department_list',
  'ustc_course_categories',
  'ustc_calendar',
  'ustc_course_search',
  'ustc_course_list',
  'ustc_course_show',
  'ustc_program_catalog',
  'ustc_program_document',
  'ustc_program_history',
  'ustc_program_history_list',
  'ustc_program_list',
  'ustc_program_show',
  'ustc_program_compare',
  'ustc_program_module',
  'ustc_lesson_list',
  'ustc_lesson_options',
  'ustc_lesson_show',
  'ustc_lesson_conflicts',
  'ustc_classroom_buildings',
  'ustc_classroom_list',
  'ustc_classroom_available',
  'ustc_classroom_show',
  'ustc_classroom_week',
  'ustc_exam_list',
  'ustc_exam_options',
  'ustc_exam_schedule',
  'ustc_exam_conflicts',
  'ustc_exam_show',
  'ustc_substitute_list',
  'ustc_substitute_explain',
  'ustc_substitute_summary',
  'ustc_course_offerings',
  'ustc_course_programs',
  'ustc_program_offerings',
  'ustc_lesson_compare',
  'ustc_lesson_community',
  'ustc_exam_for_lessons',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function selectPublicTools(tools: readonly CatalogTool[]): PublicTool[] {
  const byName = new Map<string, CatalogTool>();
  for (const tool of tools) {
    if (byName.has(tool.name)) {
      throw new Error(`Catalog MCP discovery returned duplicate tool: ${tool.name}`);
    }
    byName.set(tool.name, tool);
  }

  return PUBLIC_TOOL_NAMES.map((name) => {
    const upstream = byName.get(name);
    if (!upstream) {
      throw new Error(`Catalog MCP discovery is missing required public tool: ${name}`);
    }
    const schema: unknown = upstream.inputSchema;
    if (!isObject(schema) || schema.type !== 'object' || !isObject(schema.properties)) {
      throw new Error(`Catalog MCP public tool ${name} must have an object inputSchema with properties`);
    }

    // Keep the original definition intact for MCP output-schema validation.
    const inputSchema = structuredClone(schema);
    const properties = inputSchema.properties as Record<string, unknown>;
    delete properties.source;
    const required = Array.isArray(inputSchema.required)
      ? inputSchema.required.filter((key: unknown) => key !== 'source')
      : undefined;
    let description = upstream.description ?? name;
    if (name === 'ustc_exam_for_lessons') {
      delete properties.plan;
      inputSchema.required = [
        ...new Set([...(required ?? []).filter((key: unknown) => key !== 'plan'), 'codes', 'semester']),
      ];
      description = '查询明确学期与教学班的公开考试及冲突，不读取本地方案';
    } else if (required !== undefined) {
      inputSchema.required = required;
    }
    inputSchema.additionalProperties = false;

    return {
      upstream,
      inputSchema,
      description,
      allowedKeys: new Set(Object.keys(properties)),
    };
  });
}

function argumentError(tool: PublicTool, message: string): never {
  throw new HarnessError(`${tool.upstream.name}: ${message}`, 'CATALOG_ARGUMENT_ERROR');
}

export function publicArguments(
  tool: PublicTool,
  args: unknown,
): Record<string, unknown> {
  if (!isObject(args)) {
    argumentError(tool, '参数必须是非 null、非数组的对象');
  }

  const entries: [string, unknown][] = [];
  for (const key of Reflect.ownKeys(args)) {
    if (typeof key !== 'string' || key === 'source' || key === 'plan' || !tool.allowedKeys.has(key)) {
      argumentError(tool, `不允许参数 ${String(key)}`);
    }
    entries.push([key, args[key]]);
  }
  // Own properties only: inherited source/plan and other prototype values never cross MCP.
  const trustedArguments: Record<string, unknown> = Object.fromEntries(entries);

  if (tool.upstream.name === 'ustc_exam_for_lessons') {
    const { codes, semester } = trustedArguments;
    if (!Array.isArray(codes) || codes.length === 0) {
      argumentError(tool, 'codes 必须是非空教学班编号数组');
    }
    for (const code of codes) {
      if (typeof code !== 'string' || code.trim().length === 0) {
        argumentError(tool, 'codes 中每个教学班编号必须是非空字符串');
      }
    }
    if (
      !((typeof semester === 'string' && semester.trim().length > 0)
        || (typeof semester === 'number' && Number.isSafeInteger(semester)))
    ) {
      argumentError(tool, 'semester 必须是明确的非空学期字符串或安全整数');
    }
  }

  trustedArguments.source = 'official';
  return trustedArguments;
}
