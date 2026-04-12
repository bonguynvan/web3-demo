import { describe, it, expect, beforeEach } from 'vitest'
import { useMarginStore } from './marginStore'
import { ARBITRUM_USDC, ARBITRUM_WETH, ARBITRUM_WBTC } from '../lib/spotConstants'

beforeEach(() => {
  useMarginStore.setState({
    action: 'supply',
    selectedAsset: ARBITRUM_USDC,
    amount: '',
  })
})

describe('marginStore', () => {
  it('initializes with supply action and USDC', () => {
    const state = useMarginStore.getState()
    expect(state.action).toBe('supply')
    expect(state.selectedAsset.symbol).toBe('USDC')
    expect(state.amount).toBe('')
  })

  it('sets action and clears amount', () => {
    useMarginStore.getState().setAmount('100')
    useMarginStore.getState().setAction('borrow')

    const state = useMarginStore.getState()
    expect(state.action).toBe('borrow')
    expect(state.amount).toBe('')
  })

  it('sets selected asset and clears amount', () => {
    useMarginStore.getState().setAmount('50')
    useMarginStore.getState().setSelectedAsset(ARBITRUM_WETH)

    const state = useMarginStore.getState()
    expect(state.selectedAsset.symbol).toBe('WETH')
    expect(state.amount).toBe('')
  })

  it('sets amount', () => {
    useMarginStore.getState().setAmount('1000.50')
    expect(useMarginStore.getState().amount).toBe('1000.50')
  })

  it('resets to initial state', () => {
    useMarginStore.getState().setAction('withdraw')
    useMarginStore.getState().setSelectedAsset(ARBITRUM_WBTC)
    useMarginStore.getState().setAmount('0.5')

    useMarginStore.getState().reset()

    const state = useMarginStore.getState()
    expect(state.action).toBe('supply')
    expect(state.selectedAsset.symbol).toBe('USDC')
    expect(state.amount).toBe('')
  })

  it('supports all four actions', () => {
    for (const action of ['supply', 'borrow', 'repay', 'withdraw'] as const) {
      useMarginStore.getState().setAction(action)
      expect(useMarginStore.getState().action).toBe(action)
    }
  })
})
