import { clamp, hashString } from '../utils'
import type {
  BibleResult,
  OutlineDraft,
  RawCharacter,
  RawShot,
  ShotsRequest,
  StoryEngine,
  StoryProjectInput
} from './types'

const FEMALE = ['林晚', '苏念', '沈知夏', '顾星野', '唐可可', '许清欢', '程见微', '温以宁']
const MALE = ['陆沉', '江临', '陈既白', '周叙', '裴恩', '宋衡', '贺川', '顾言深']

const LOOKS = [
  '28 岁，短发利落，眉骨清晰，穿深灰色西装，眼神冷静克制',
  '32 岁，长发挽起，杏眼薄唇，米白色风衣，气质疏离',
  '26 岁，寸头，轮廓分明，黑色高领毛衣，神情阴郁',
  '35 岁，金丝眼镜，微卷短发，深蓝衬衫，笑容得体却疏远',
  '24 岁，马尾辫，圆眼，浅色卫衣，干净明亮',
  '40 岁，背头，法令纹深，定制西装，压迫感强'
]

const PERSONALITIES = ['外冷内热，记仇也记恩', '看似温和，实则步步为营', '倔强直接，不服输', '圆滑世故，利益至上', '敏感细腻，重情义']

const EPISODE_TITLES = ['裂缝', '旧账', '反将一军', '当众揭穿', '退无可退', '最后一局', '尘埃落定', '新的开始']

const GENRE_BEATS: Record<string, string[][]> = {
  都市逆袭: [
    ['主角被当众羞辱', '主角意外拿到关键证据', '主角亮出隐藏身份', '对手当场失态'],
    ['旧同事设局', '主角将计就计', '会议室反转', '真正的幕后黑手浮现'],
    ['主角被逼到绝境', '一段旧录音曝光', '盟友倒戈', '主角反手翻盘']
  ],
  甜宠言情: [
    ['意外同居', '被迫假扮情侣', '误会升级', '真心情动'],
    ['前任突然出现', '主角吃醋', '雨夜告白', '关系公开']
  ],
  悬疑推理: [
    ['发现异常线索', '关键证人失踪', '第一次反转', '真凶浮出水面'],
    ['所有人都有不在场证明', '第二具尸体出现', '录像被篡改', '主角设局引蛇出洞']
  ],
  古装权谋: [
    ['朝堂试探', '密信被截', '盟友蒙冤', '布局反杀'],
    ['宫宴刺杀', '证据指向最亲近的人', '主角将计就计', '棋局揭晓']
  ]
}

const SCENES: Record<string, string[]> = {
  都市逆袭: ['深夜写字楼', '空荡的会议室', '地下车库', '出租屋', '公司天台', '高档餐厅'],
  甜宠言情: ['雨天便利店', '合租公寓客厅', '医院走廊', '城市天桥', '咖啡馆'],
  悬疑推理: ['废弃仓库', '审讯室', '雨夜小巷', '证物室', '旧档案馆'],
  古装权谋: ['金銮殿', '御花园', '暗室', '府邸书房', '长街'],
  科幻未来: ['休眠舱', '环形控制室', '霓虹街头', '数据中枢', '废弃空间站'],
  家庭伦理: ['老房子客厅', '医院病房', '厨房', '家族墓地', '饭桌前'],
  灵异惊悚: ['老宅走廊', '地下室', '午夜教室', '荒废祠堂', '镜前'],
  职场商战: ['董事会会议室', '加班工位', '电梯间', '酒局包厢', '机场贵宾厅'],
  青春校园: ['教室后排', '操场看台', '宿舍天台', '图书馆', '校门口'],
  武侠江湖: ['客栈大堂', '山间竹亭', '雨夜长街', '断崖', '古寺']
}

const DIALOGUE: Record<string, string[]> = {
  都市逆袭: ['这笔账，我记了三年。', '你确定要在这里说？', '现在，轮到我定价了。', '你当年怎么对我的，今天加倍还。', '我不需要解释。'],
  甜宠言情: ['你离我这么近干什么？', '我没有喜欢你。', '那这束花是谁送的？', '别走。', '你就不能诚实一次吗？'],
  悬疑推理: ['这个时间对不上。', '你在撒谎。', '尸体不会自己移动。', '真正的凶手，还在这栋楼里。', '我早就知道你会来。'],
  古装权谋: ['这盘棋，你输了。', '谁敢动她？', '证据在此，陛下明鉴。', '臣，问心无愧。', '今夜之后，朝局该变了。'],
  职场商战: ['这个项目我接手。', '你越界了。', '数据不会骗人。', '董事会见。', '条件，由我来开。'],
  青春校园: ['你到底想说什么？', '放学别走。', '这道题我讲给你听。', '我等你很久了。', '最后一次机会。']
}

const DEFAULT_BEATS = [
  ['主角平静的日常被打破', '一个关键人物出现', '隐藏的秘密被揭开', '主角做出选择'],
  ['局势急转直下', '主角失去最重要的东西', '一次意外的重逢', '反击开始']
]

export class DemoStoryEngine implements StoryEngine {
  readonly id = 'demo'
  readonly isDemo = true

  async createBible(input: StoryProjectInput): Promise<BibleResult> {
    const seed = hashString(`${input.idea}|${input.genre}|${input.title}`)
    const female = FEMALE[seed % FEMALE.length]
    const male = MALE[(seed >>> 3) % MALE.length]
    const rival = MALE[(seed >>> 7) % MALE.length] === male ? FEMALE[(seed >>> 9) % FEMALE.length] : MALE[(seed >>> 7) % MALE.length]
    const support = seed % 2 === 0 ? FEMALE[(seed >>> 11) % FEMALE.length] : MALE[(seed >>> 11) % MALE.length]

    const characters: RawCharacter[] = [
      {
        name: female,
        role: '主角',
        description: `${input.idea.slice(0, 60)}。故事的核心推动者。`,
        appearancePrompt: LOOKS[seed % LOOKS.length],
        personality: PERSONALITIES[seed % PERSONALITIES.length],
        voice: '清亮但克制，情绪爆发时有力量'
      },
      {
        name: male,
        role: '男主',
        description: '与主角关系复杂，既是对手也是盟友。',
        appearancePrompt: LOOKS[(seed + 2) % LOOKS.length],
        personality: PERSONALITIES[(seed + 1) % PERSONALITIES.length],
        voice: '低沉平稳，语速偏慢'
      },
      {
        name: rival,
        role: '对手',
        description: '站在主角对立面的人，掌握着关键资源或秘密。',
        appearancePrompt: LOOKS[(seed + 3) % LOOKS.length],
        personality: PERSONALITIES[(seed + 3) % PERSONALITIES.length],
        voice: '锋利、带笑意'
      },
      {
        name: support,
        role: '关键配角',
        description: '主角身边最信任的人，提供情报与情感支撑。',
        appearancePrompt: LOOKS[(seed + 4) % LOOKS.length],
        personality: PERSONALITIES[(seed + 4) % PERSONALITIES.length],
        voice: '轻快、真诚'
      }
    ]

    const outlines: OutlineDraft[] = Array.from({ length: Math.max(1, input.episodesCount) }, (_, index) => {
      const beatsPool = GENRE_BEATS[input.genre] ?? DEFAULT_BEATS
      const beats = beatsPool[(seed + index) % beatsPool.length]
      return {
        title: EPISODE_TITLES[(seed + index) % EPISODE_TITLES.length],
        synopsis: `${input.idea} 第 ${index + 1} 集：${beats[0]}，${beats[1]}。当所有人以为结局已定时，${female} 做出了一个出人意料的决定。`,
        beats
      }
    })

    return {
      logline: input.idea,
      synopsis: `${input.idea} 在一次次交锋中，${female} 必须决定是继续隐忍，还是把所有人拖进她布好的局里。每一次退让都是算计，每一次沉默都在等一个时机。`,
      tone: input.genre.includes('甜') ? '轻盈甜爽，暗流涌动' : input.genre.includes('悬疑') ? '冷峻压抑，反转密集' : '压抑后爆发，强爽感',
      characters,
      outlines
    }
  }

  async createShots(input: ShotsRequest): Promise<RawShot[]> {
    const { project, bible, episode, episodeIndex } = input
    const seed = hashString(`${project.idea}|${episodeIndex}|${episode.title}`)
    const count = clamp(Math.round(project.episodeDuration / 3.6), 6, 12)
    const scenes = SCENES[project.genre] ?? SCENES['都市逆袭']
    const lines = DIALOGUE[project.genre] ?? DIALOGUE['都市逆袭']
    const lead = bible.characters[0]
    const rival = bible.characters[2] ?? bible.characters[1]
    const shotSizes = ['远景', '中景', '特写', '近景', '全景']
    const moves = ['固定', '推镜', '摇镜', '移镜', '跟拍']
    const perShot = project.episodeDuration / count
    const shots: RawShot[] = []

    for (let i = 0; i < count; i += 1) {
      const scene = scenes[(seed + i) % scenes.length]
      const size = shotSizes[i % shotSizes.length]
      const move = moves[(seed + i) % moves.length]
      const isDialogue = i >= 1 && i % 2 === 0
      const speaker = i % 4 === 0 ? rival : lead
      const line = isDialogue ? lines[(seed + i) % lines.length] : ''
      const beat = episode.beats[i % Math.max(1, episode.beats.length)] ?? episode.synopsis
      const duration = i === count - 1 ? Math.max(2, project.episodeDuration - perShot * (count - 1)) : perShot
      const action = describeBeat(beat, lead.name, rival.name, i, count)
      shots.push({
        scene,
        shotSize: size,
        cameraMove: move,
        duration: Math.round(duration * 10) / 10,
        action,
        dialogue: line ? `${speaker.name}：${line}` : '',
        narration: i === 0 ? '退让换不来体面。' : '',
        imagePrompt: [
          `${project.style}，电影感画面，${scene}，${size}，${move}`,
          `${action}`,
          `${lead.name}：${lead.appearancePrompt}`,
          `统一色调，冷暖对比，浅景深，高质量细节，无文字水印`
        ].join('。'),
        videoPrompt: `${move}，${size}，${action}，人物动作自然连贯`,
        negativePrompt: '文字, 水印, 畸形手指, 面部崩坏, 低清晰度, 画面抖动, 风格漂移'
      })
    }
    return shots
  }

  async test(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: '内置演示编剧已就绪（离线模板，无需 API Key）' }
  }
}

function describeBeat(beat: string, lead: string, rival: string, index: number, total: number): string {
  if (index === 0) return `${beat}。${lead}站在画面一侧，表情克制，背景人群虚化`
  if (index === total - 1) return `${beat}。${lead}转身离开，${rival}留在原地，画面定格`
  if (index % 3 === 0) return `${beat}。${rival}逼近一步，${lead}没有后退`
  if (index % 3 === 1) return `${beat}。特写${lead}的手指微微收紧，眼神从隐忍转为锋利`
  return `${beat}。${lead}与${rival}隔着桌子对视，空气凝滞`
}
