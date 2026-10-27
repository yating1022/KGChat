import type { PracticeQuestion } from '../chat/chatTypes'
import type { PracticeStart } from '../features/practice/practiceService'

/**
 * Neutral local question fixtures for component/state tests. They are not
 * imported by the application and never reach the runtime bundle.
 */
export const TEST_QUESTIONS: PracticeQuestion[] = [
  {
    id: 900_001,
    type: 'single',
    title: '下列词语中，没有错别字的一项是：',
    options: ['一如既往', '迫不急待', '再接再励', '默守成规'],
    correctAnswer: ['A'],
    analysis: '“一如既往”没有错别字。其余三项应写作“迫不及待”“再接再厉”“墨守成规”。',
    source: '测试题',
    tag: '词语辨析',
  },
  {
    id: 900_002,
    type: 'multiple',
    title: '下列句子中，使用了比喻修辞手法的有：',
    options: [
      '月光像流水一样泻在院子里。',
      '他跑得比风还快。',
      '小鸟在枝头唱歌。',
      '她的笑容像春天的阳光。',
    ],
    correctAnswer: ['A', 'D'],
    analysis:
      'A、D 两项都有明显的喻体和比喻词，属于比喻。B 项是比较和夸张，C 项是拟人。',
    source: '测试题',
    tag: '修辞手法',
  },
  {
    id: 900_003,
    type: 'judge',
    title: '“不刊之论”指不能改动或不可磨灭的言论。',
    options: ['正确', '错误'],
    correctAnswer: ['A'],
    analysis: '“刊”在这里是削除、修改的意思，因此“不刊之论”指不可修改的言论。',
    source: '测试题',
    tag: '成语辨析',
  },
]

export const TEST_PRACTICE_START: PracticeStart = {
  questions: TEST_QUESTIONS,
  title: '测试练习',
  intro: '先看第一道。',
  remote: true,
}
