import { describe, it, expect, beforeEach } from 'vitest'
import { useSpotStore } from './spotStore'
import { NATIVE_ETH, ARBITRUM_USDC, ARBITRUM_ARB } from '../lib/spotConstants'

beforeEach(() => {
  // Reset store between tests
  useSpotStore.setState({
    sellToken: NATIVE_ETH,
    buyToken: ARBITRUM_USDC,
    sellAmount: '',
    slippageBps: 50,
  })
})

describe('spotStore', () => {
  it('initializes with ETH → USDC', () => {
    const state = useSpotStore.getState()
    expect(state.sellToken.symbol).toBe('ETH')
    expect(state.buyToken.symbol).toBe('USDC')
    expect(state.sellAmount).toBe('')
    expect(state.slippageBps).toBe(50)
  })

  it('sets sell amount', () => {
    useSpotStore.getState().setSellAmount('1.5')
    expect(useSpotStore.getState().sellAmount).toBe('1.5')
  })

  it('sets slippage', () => {
    useSpotStore.getState().setSlippageBps(100)
    expect(useSpotStore.getState().slippageBps).toBe(100)
  })

  it('flips tokens and clears amount', () => {
    useSpotStore.getState().setSellAmount('10')
    useSpotStore.getState().flipTokens()

    const state = useSpotStore.getState()
    expect(state.sellToken.symbol).toBe('USDC')
    expect(state.buyToken.symbol).toBe('ETH')
    expect(state.sellAmount).toBe('')
  })

  it('swaps tokens when selecting the same token on opposite side', () => {
    // Buy is USDC. Setting sell to USDC should swap them.
    useSpotStore.getState().setSellToken(ARBITRUM_USDC)

    const state = useSpotStore.getState()
    expect(state.sellToken.symbol).toBe('USDC')
    expect(state.buyToken.symbol).toBe('ETH') // was sell, now buy
    expect(state.sellAmount).toBe('') // cleared
  })

  it('sets a different buy token without swapping', () => {
    useSpotStore.getState().setBuyToken(ARBITRUM_ARB)

    const state = useSpotStore.getState()
    expect(state.sellToken.symbol).toBe('ETH')
    expect(state.buyToken.symbol).toBe('ARB')
  })

  it('resets to initial state', () => {
    useSpotStore.getState().setSellAmount('999')
    useSpotStore.getState().setSlippageBps(200)
    useSpotStore.getState().setBuyToken(ARBITRUM_ARB)

    useSpotStore.getState().reset()

    const state = useSpotStore.getState()
    expect(state.sellToken.symbol).toBe('ETH')
    expect(state.buyToken.symbol).toBe('USDC')
    expect(state.sellAmount).toBe('')
    expect(state.slippageBps).toBe(50)
  })
})
