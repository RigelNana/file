import { defineConfig } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'

// 从文件夹名称中提取显示文本（去掉序号前缀）
function cleanName(name: string): string {
  return name.replace(/^\d+-/, '')
}

// 扫描一个章节目录，生成侧边栏子项
function buildSectionItems(sectionDir: string, urlPrefix: string) {
  if (!fs.existsSync(sectionDir)) return []

  const entries = fs.readdirSync(sectionDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

  return entries.map(entry => {
    const subDir = path.join(sectionDir, entry.name)
    const subEntries = fs.readdirSync(subDir, { withFileTypes: true })

    // 查找该子目录下的 .md 文件作为直接链接
    const mdFile = subEntries.find(e => e.isFile() && e.name.endsWith('.md'))
    if (mdFile) {
      return {
        text: cleanName(entry.name),
        link: `${urlPrefix}${entry.name}/${mdFile.name.replace(/\.md$/, '')}`,
      }
    }
    return null
  }).filter(Boolean)
}

// 扫描顶级板块目录，生成完整的侧边栏
function buildSidebar(baseDir: string, urlBase: string) {
  const topDirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^\d+-.+/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

  return topDirs.map(dir => {
    const dirPath = path.join(baseDir, dir.name)
    const urlPrefix = `${urlBase}${dir.name}/`

    // 查找该目录下的概览 md 文件
    const overviewFile = fs.readdirSync(dirPath)
      .find(f => f.endsWith('.md') && !f.startsWith('00-'))

    const items = buildSectionItems(dirPath, urlPrefix)
    const result: any = {
      text: cleanName(dir.name),
      collapsed: true,
      items,
    }
    // 如果有概览文件，作为该分组的链接
    if (overviewFile) {
      result.link = `${urlPrefix}${overviewFile.replace(/\.md$/, '')}`
    }
    return result
  })
}

const rootDir = path.resolve(__dirname, '..')

export default defineConfig({
  base: '/file/',
  title: '八股文笔记',
  description: '算法 · 后端 · DevOps 知识体系',
  lang: 'zh-CN',

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '算法', link: '/Algo/00-目录总览' },
      { text: '后端', link: '/Backend/00-目录总览' },
      { text: 'DevOps', link: '/DevOps/00-目录总览' },
    ],

    sidebar: {
      '/Algo/': [
        {
          text: '算法',
          link: '/Algo/00-目录总览',
          items: buildSidebar(path.join(rootDir, 'Algo'), '/Algo/'),
        },
      ],
      '/Backend/': [
        {
          text: '后端',
          link: '/Backend/00-目录总览',
          items: buildSidebar(path.join(rootDir, 'Backend'), '/Backend/'),
        },
      ],
      '/DevOps/': [
        {
          text: 'DevOps',
          link: '/DevOps/00-目录总览',
          items: buildSidebar(path.join(rootDir, 'DevOps'), '/DevOps/'),
        },
      ],
    },

    outline: {
      level: [2, 3],
      label: '目录',
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索', buttonAriaLabel: '搜索' },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },

    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
  },
})
