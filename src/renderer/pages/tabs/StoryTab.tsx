import type { JSX } from 'react'
import {
  BookOpen,
  Loader2,
  RefreshCw,
  Sparkles,
  UserRound,
  Wand2
} from 'lucide-react'
import type { Project } from '@shared/types'
import { useAppStore } from '@/stores/appStore'
import { assetUrl } from '@/lib/api'
import { assetLabel, assetTone, cn } from '@/lib/format'

export default function StoryTab({
  project,
  running
}: {
  project: Project
  running: boolean
}): JSX.Element {
  const mutate = useAppStore((state) => state.mutate)
  const updateCharacter = useAppStore((state) => state.updateCharacter)
  const updateEpisode = useAppStore((state) => state.updateEpisode)
  const runPipeline = useAppStore((state) => state.runPipeline)
  const bible = project.bible

  if (!bible) {
    return (
      <div className="panel px-10 py-16 text-center fade-in">
        <BookOpen size={30} className="mx-auto text-mist-500/60" />
        <h2 className="mt-4 text-[16px] font-medium text-mist-300">还没有剧本与角色</h2>
        <p className="mt-2 text-[12px] text-mist-500">
          先让流水线扩写一句话创意，生成故事梗概、分集大纲和角色圣经。
        </p>
        <button
          className="btn btn-primary mt-6"
          disabled={running}
          onClick={() => void runPipeline({ from: 'script', force: true })}
        >
          {running ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
          生成剧本与角色
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5 fade-in">
      <div className="panel p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="section-title">剧集圣经</div>
            <div className="mt-1 text-[11.5px] text-mist-500">
              修改后会影响后续分镜提示词；重新生成分镜时使用这里的设定。
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-sm"
              disabled={running}
              onClick={() => void runPipeline({ from: 'script', force: true })}
            >
              <Wand2 size={12} />
              重写大纲
            </button>
            <button
              className="btn btn-sm"
              disabled={running}
              onClick={() => void runPipeline({ from: 'characters', force: true })}
            >
              <RefreshCw size={12} />
              重做定妆
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="label">一句话故事线</label>
            <textarea
              className="textarea"
              rows={2}
              value={bible.logline}
              onChange={(event) =>
                mutate((draft) => {
                  if (draft.bible) draft.bible.logline = event.target.value
                })
              }
            />
          </div>
          <div>
            <label className="label">整体基调</label>
            <textarea
              className="textarea"
              rows={2}
              value={bible.tone}
              onChange={(event) =>
                mutate((draft) => {
                  if (draft.bible) draft.bible.tone = event.target.value
                })
              }
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="label">故事梗概</label>
          <textarea
            className="textarea"
            rows={4}
            value={bible.synopsis}
            onChange={(event) =>
              mutate((draft) => {
                if (draft.bible) draft.bible.synopsis = event.target.value
              })
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-[1.05fr_0.95fr] gap-5 items-start">
        <div className="panel p-5">
          <div className="flex items-center justify-between">
            <div className="section-title">分集大纲</div>
            <span className="text-[10.5px] text-mist-500">{project.episodes.length} 集</span>
          </div>
          <div className="mt-4 space-y-3">
            {project.episodes.map((episode) => (
              <div key={episode.id} className="panel-soft p-4">
                <div className="flex items-center gap-2">
                  <span className="badge badge-violet mono">EP{String(episode.index).padStart(2, '0')}</span>
                  <input
                    className="input h-8 py-0 text-[13px] font-medium"
                    value={episode.title}
                    onChange={(event) =>
                      updateEpisode(episode.id, { title: event.target.value })
                    }
                  />
                </div>
                <textarea
                  className="textarea mt-2.5 text-[12px]"
                  rows={2}
                  value={episode.synopsis}
                  onChange={(event) =>
                    updateEpisode(episode.id, { synopsis: event.target.value })
                  }
                />
                <div className="mt-2">
                  <label className="label mb-1">情节点（每行一个）</label>
                  <textarea
                    className="textarea text-[11.5px]"
                    rows={3}
                    value={(episode.beats ?? []).join('\n')}
                    onChange={(event) =>
                      updateEpisode(episode.id, {
                        beats: event.target.value.split('\n').filter((line) => line.trim())
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-5">
          <div className="flex items-center justify-between">
            <div className="section-title">角色圣经</div>
            <span className="text-[10.5px] text-mist-500">
              {bible.characters.length} 个角色
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {bible.characters.map((character) => (
              <div key={character.id} className="panel-soft p-3 flex gap-3">
                <div className="w-[86px] shrink-0">
                  <div className="aspect-[4/5] rounded-lg overflow-hidden bg-ink-900 border border-line">
                    {character.portraitPath ? (
                      <img
                        src={assetUrl(project.id, character.portraitPath)}
                        alt={character.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-mist-500/50">
                        <UserRound size={22} />
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 flex justify-center">
                    <span className={cn('badge', assetTone(character.portraitStatus))}>
                      {assetLabel(character.portraitStatus)}
                    </span>
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex gap-2">
                    <input
                      className="input h-7 py-0 text-[12.5px] font-medium"
                      value={character.name}
                      onChange={(event) =>
                        updateCharacter(character.id, { name: event.target.value })
                      }
                    />
                    <input
                      className="input h-7 py-0 text-[11px] w-[92px]"
                      value={character.role}
                      onChange={(event) =>
                        updateCharacter(character.id, { role: event.target.value })
                      }
                    />
                  </div>
                  <textarea
                    className="textarea text-[11.5px]"
                    rows={3}
                    placeholder="外观提示词：年龄、发型、服装、体态、气质"
                    value={character.appearancePrompt}
                    onChange={(event) =>
                      updateCharacter(character.id, { appearancePrompt: event.target.value })
                    }
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="input h-7 py-0 text-[11px]"
                      placeholder="性格关键词"
                      value={character.personality}
                      onChange={(event) =>
                        updateCharacter(character.id, { personality: event.target.value })
                      }
                    />
                    <input
                      className="input h-7 py-0 text-[11px]"
                      placeholder="建议声线"
                      value={character.voice}
                      onChange={(event) =>
                        updateCharacter(character.id, { voice: event.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[10.5px] leading-relaxed text-mist-500">
            角色外观提示词会自动拼进每个镜头，保持全片一致性。修改后关键帧会标记为待更新。
          </div>
        </div>
      </div>
    </div>
  )
}
