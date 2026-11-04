import type { AppSettings, StageKey } from './types'

export const SECRET_MASK = '__SAVED__'

export const STAGE_ORDER: StageKey[] = [
  'script',
  'characters',
  'storyboard',
  'images',
  'audio',
  'videos',
  'subtitles',
  'render'
]

export const STAGE_META: Record<StageKey, { label: string; short: string; description: string }> = {
  script: {
    label: '创意与大纲',
    short: '大纲',
    description: '把一句话扩写成故事梗概、分集大纲和角色名单'
  },
  characters: {
    label: '角色设定',
    short: '角色',
    description: '生成角色外观锚点与定妆照，保证全片一致性'
  },
  storyboard: {
    label: '分镜脚本',
    short: '分镜',
    description: '拆解景别、运镜、台词与画面提示词'
  },
  images: {
    label: '关键帧',
    short: '画面',
    description: '为每个镜头生成首帧画面'
  },
  audio: {
    label: '配音',
    short: '配音',
    description: '为台词与旁白生成语音，确定镜头实际时长'
  },
  videos: {
    label: '视频片段',
    short: '视频',
    description: '把关键帧转成可剪辑的动态镜头'
  },
  subtitles: {
    label: '字幕',
    short: '字幕',
    description: '按配音时长生成 SRT / ASS 字幕'
  },
  render: {
    label: '成片合成',
    short: '成片',
    description: '统一规格、拼接、混音、烧字幕并导出 MP4'
  }
}

export const GENRES = [
  '都市逆袭',
  '甜宠言情',
  '悬疑推理',
  '古装权谋',
  '科幻未来',
  '家庭伦理',
  '灵异惊悚',
  '职场商战',
  '青春校园',
  '武侠江湖'
]

export const STYLE_PRESETS = [
  '电影感写实',
  '日系清新',
  '国风工笔',
  '赛博朋克',
  '复古胶片',
  '3D 动画',
  '水墨意境',
  '黑白默片'
]

export const SHOT_SIZES = ['远景', '全景', '中景', '近景', '特写']
export const CAMERA_MOVES = ['固定', '推镜', '拉镜', '摇镜', '移镜', '升降', '跟拍', '环绕']

export const TEXT_PRESETS = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' }
]

export const IMAGE_PRESETS = [
  { name: 'OpenAI Images', baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-1', size: '1024x1536' },
  { name: '可灵', baseUrl: 'https://api-beijing.klingai.com', model: 'kling-v2', size: '' },
  { name: 'ComfyUI', baseUrl: 'http://127.0.0.1:8188', model: '', size: '' }
]

export const VIDEO_PRESETS = [
  { name: '可灵', baseUrl: 'https://api-beijing.klingai.com', model: 'kling-v2-5-turbo', mode: 'std' as const },
  { name: 'ComfyUI', baseUrl: 'http://127.0.0.1:8188', model: '', mode: 'std' as const }
]

export const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
export const SYSTEM_VOICES = {
  win32: ['Microsoft Huihui Desktop', 'Microsoft Yaoyao Desktop', 'Microsoft Kangkang Desktop'],
  darwin: ['Tingting', 'Meijia', 'Sinji']
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  demoMode: true,
  providers: {
    text: {
      kind: 'demo',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: '',
      model: 'deepseek-chat',
      temperature: 0.8
    },
    image: {
      kind: 'demo',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      secretKey: '',
      model: 'gpt-image-1',
      size: '1024x1536',
      workflowPath: ''
    },
    video: {
      kind: 'demo',
      baseUrl: 'https://api-beijing.klingai.com',
      apiKey: '',
      secretKey: '',
      model: 'kling-v2-5-turbo',
      mode: 'std',
      workflowPath: '',
      timeoutSec: 600
    },
    tts: {
      kind: 'system',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'tts-1',
      voice: 'alloy',
      systemVoice: '',
      rate: 0
    }
  },
  media: {
    imageConcurrency: 3,
    videoConcurrency: 2,
    fps: 30,
    burnSubtitles: true,
    bgmVolume: 0.28,
    subtitleFont: ''
  },
  paths: {
    ffmpegPath: '',
    ffprobePath: ''
  }
}

export const SAMPLE_PROJECT = {
  title: '被裁掉的女孩',
  idea: '被公司恶意裁员的女孩，三年后以投资人的身份回到会议室，当众揭穿当年构陷她的上司。',
  genre: '都市逆袭',
  style: '电影感写实'
}
