import type { Character, Project, Shot } from '../../../shared/types'
import type { RawCharacter, ShotsRequest, StoryProjectInput } from '../providers/types'

const SYSTEM = [
  '你是一位顶级中文竖屏短剧编剧、分镜师和 AI 视觉提示词工程师。',
  '你熟悉抖音/快手短剧节奏：前 3 秒必须有钩子，冲突密集，台词短促，每集结尾留悬念。',
  '你的输出必须是严格合法的 JSON，不要输出 markdown 代码块、解释文字或注释。',
  '所有文本使用简体中文。'
].join('\n')

export function storySystemPrompt(): string {
  return SYSTEM
}

export function buildBiblePrompt(input: StoryProjectInput): string {
  return [
    '请为下面这个短剧项目建立"剧集圣经"：故事梗概、基调、主要角色，以及每一集的大纲。',
    '',
    `项目标题：${input.title || '未命名'}`,
    `一句话创意：${input.idea}`,
    `题材：${input.genre}`,
    `视觉风格：${input.style}`,
    `画幅：${input.aspect === '9:16' ? '竖屏 9:16' : '横屏 16:9'}`,
    `集数：${input.episodesCount}`,
    `单集时长：约 ${input.episodeDuration} 秒`,
    '',
    '要求：',
    '1. 角色 3–5 个，包含主角、对手/阻力角色、关键配角；每个角色给出可用于 AI 绘图的外观提示词（年龄、发型、服装、体态、气质），且全片保持一致。',
    '2. 每一集大纲包含标题、150 字以内梗概、4–6 个情节点（beats），情节点要能直接拆成分镜。',
    '3. 第 1 集前 3 秒必须是强冲突或强悬念。',
    '4. 角色名要具体、易记，不要用"女主""男主"作为名字。',
    '',
    '严格输出 JSON，结构如下：',
    JSON.stringify(
      {
        logline: '一句话故事线',
        synopsis: '整体故事梗概，300 字以内',
        tone: '整体基调，例如：压抑后爆发、爽感逆袭',
        characters: [
          {
            name: '角色名',
            role: '主角/对手/配角',
            description: '身份与人物关系',
            appearancePrompt: '年龄、发型、脸型、服装、体态、气质，供 AI 绘图保持一致',
            personality: '性格关键词',
            voice: '建议声线，例如：低沉克制、清亮倔强'
          }
        ],
        episodes: [
          {
            title: '分集标题',
            synopsis: '本集梗概',
            beats: ['情节点 1', '情节点 2', '情节点 3']
          }
        ]
      },
      null,
      2
    )
  ].join('\n')
}

export function buildShotsPrompt(req: ShotsRequest): string {
  const { project, bible, episode, episodeIndex } = req
  const cast = bible.characters
    .map((character) => `- ${character.name}（${character.role}）：${character.appearancePrompt}`)
    .join('\n')
  const shotCount = Math.max(4, Math.min(14, Math.round(project.episodeDuration / 4)))
  return [
    `请把第 ${episodeIndex + 1} 集《${episode.title}》拆成可直接拍摄/生成的分镜脚本。`,
    '',
    `项目：${project.title}`,
    `一句话创意：${project.idea}`,
    `题材：${project.genre}；风格：${project.style}；画幅：${project.aspect}`,
    `本集梗概：${episode.synopsis}`,
    `情节点：${episode.beats.join('；')}`,
    '',
    '角色外观锚点（分镜提示词中必须保持这些描述一致）：',
    cast || '（暂无）',
    '',
    `要求：`,
    `1. 生成约 ${shotCount} 个镜头（允许 ±2），总时长接近 ${project.episodeDuration} 秒，单镜头 2–6 秒。`,
    '2. 景别只用：远景/全景/中景/近景/特写；运镜只用：固定/推镜/拉镜/摇镜/移镜/升降/跟拍/环绕。',
    '3. 至少 60% 的镜头有台词或旁白，台词要短（每句不超过 22 个汉字），口语化、有冲突感。',
    '4. imagePrompt 是给文生图模型的完整中文提示词：包含场景、人物外观、景别、光线、构图、风格；不要写"如图""同上"这类指代。',
    '5. videoPrompt 描述镜头如何运动、人物动作如何变化，不要重复画面静态描述。',
    '6. negativePrompt 给出需要避免的问题（文字水印、畸形手、换脸、风格漂移等）。',
    '7. 镜头之间要有连贯性：同一场景的光线和人物服装保持一致。',
    '',
    '严格输出 JSON，结构如下：',
    JSON.stringify(
      {
        shots: [
          {
            scene: '场景地点，例如：深夜办公室',
            shotSize: '中景',
            cameraMove: '推镜',
            duration: 3.5,
            action: '画面中发生的事，包含人物动作与表情',
            dialogue: '角色台词，没有则空字符串',
            narration: '旁白，没有则空字符串',
            imagePrompt: '完整的中文文生图提示词',
            videoPrompt: '镜头运动与动作描述',
            negativePrompt: '需要避免的画面问题'
          }
        ]
      },
      null,
      2
    )
  ].join('\n')
}

export function composeImagePrompt(shot: Shot, project: Project, characters: Character[]): string {
  const anchors = matchCharacters(`${shot.action} ${shot.dialogue} ${shot.scene}`, characters)
  const cast = anchors
    .map((character) => `${character.name}：${character.appearancePrompt || character.description}`)
    .filter(Boolean)
    .join('；')
  const parts = [
    `${project.style}，${project.aspect === '9:16' ? '竖屏 9:16 构图' : '横屏 16:9 构图'}，电影级画面`,
    `${shot.scene}，${shot.shotSize}，${shot.cameraMove}`,
    shot.action,
    shot.imagePrompt,
    cast ? `角色一致性：${cast}` : '',
    '统一色调，电影级光影，细节丰富，构图干净，画面中不要出现任何文字和水印'
  ].filter(Boolean)
  return parts.join('。').slice(0, 1600)
}

export function composeVideoPrompt(shot: Shot, project: Project): string {
  const parts = [
    shot.videoPrompt,
    `${shot.cameraMove}，${shot.shotSize}`,
    shot.action,
    `${project.style}，运动自然，人物面部稳定，避免形变`
  ].filter(Boolean)
  return parts.join('。').slice(0, 900)
}

export function composePortraitPrompt(character: Character, project: Pick<Project, 'style'>): string {
  return [
    `角色定妆照，${character.name}，${character.role}`,
    character.appearancePrompt,
    character.description,
    '半身像，中性纯色背景，正面柔光，表情自然，服装细节清晰',
    `${project.style}，电影质感，高细节，不要文字和水印`
  ]
    .filter(Boolean)
    .join('。')
}

export function defaultNegativePrompt(): string {
  return '文字, 水印, logo, 字幕, 畸形手指, 多余肢体, 面部崩坏, 换脸, 低清晰度, 模糊, 拼接痕迹, 风格漂移'
}

function matchCharacters(text: string, characters: Character[]): Character[] {
  const matched = characters.filter((character) => character.name && text.includes(character.name))
  if (matched.length > 0) return matched.slice(0, 3)
  return characters.slice(0, 2)
}

export function rawCharacterToCharacter(raw: RawCharacter): Character {
  return {
    id: '',
    name: raw.name,
    role: raw.role || '配角',
    description: raw.description || '',
    appearancePrompt: raw.appearancePrompt || raw.description || '',
    personality: raw.personality || '',
    voice: raw.voice || '',
    portraitStatus: 'pending'
  }
}
