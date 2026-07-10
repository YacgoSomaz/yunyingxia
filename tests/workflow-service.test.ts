import { describe, expect, it } from 'vitest'
import { TemplateService } from '../electron/template-service'
import { WorkspaceService } from '../electron/workspace-service'
import { WorkflowService, type CompletionClient } from '../electron/workflow-service'

const llm: CompletionClient = {
  complete: async (_messages) => '生成内容'
}

describe('WorkflowService', () => {
  it('runs the copywriting pipeline and saves the result locally', async () => {
    const workspace = new WorkspaceService(':memory:')
    const workflow = new WorkflowService(new TemplateService(':memory:'), workspace, llm)
    const steps: string[] = []

    const record = await workflow.generate(
      { topic: '夏日收纳', platform: '小红书', style: '轻松实用', notes: '面向租房人群' },
      (step) => steps.push(step)
    )

    expect(steps).toEqual(['生成大纲', '扩写文案', '润色文案', '生成标题', '切分字幕'])
    expect(record.topic).toBe('夏日收纳')
    expect(record.content).toBe('生成内容')
    expect(workspace.list()).toHaveLength(1)
  })
})
