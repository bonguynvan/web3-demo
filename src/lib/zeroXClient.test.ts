import { describe, it, expect, vi, beforeEach } from 'vitest'
import { zeroXClient, type SwapParams } from './zeroXClient'
import { NATIVE_ETH, ARBITRUM_USDC } from './spotConstants'

const mockParams: SwapParams = {
  sellToken: NATIVE_ETH,
  buyToken: ARBITRUM_USDC,
  sellAmount: '1000000000000000000', // 1 ETH
  taker: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  slippageBps: 50,
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('zeroXClient.getPrice', () => {
  it('builds correct URL with query params', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        sellAmount: '1000000000000000000',
        buyAmount: '3500000000',
        route: { fills: [] },
      }), { status: 200 }),
    )

    await zeroXClient.getPrice(mockParams)

    const url = new URL(fetchSpy.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/swap/allowance-holder/price')
    expect(url.searchParams.get('sellToken')).toBe(NATIVE_ETH.address)
    expect(url.searchParams.get('buyToken')).toBe(ARBITRUM_USDC.address)
    expect(url.searchParams.get('sellAmount')).toBe('1000000000000000000')
    expect(url.searchParams.get('taker')).toBe(mockParams.taker)
    expect(url.searchParams.get('slippageBps')).toBe('50')
  })

  it('includes 0x headers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        sellAmount: '1000000000000000000',
        buyAmount: '3500000000',
        route: { fills: [] },
      }), { status: 200 }),
    )

    await zeroXClient.getPrice(mockParams)

    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['0x-chain-id']).toBe('eip155:42161')
    expect(headers['0x-version']).toBe('2')
  })

  it('returns success with parsed quote', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        sellAmount: '1000000000000000000',
        buyAmount: '3500000000', // 3500 USDC (6 decimals)
        estimatedPriceImpact: 0.05,
        gas: '150000',
        route: {
          fills: [
            { source: 'Uniswap_V3', proportionBps: 8000 },
            { source: 'Camelot', proportionBps: 2000 },
          ],
        },
      }), { status: 200 }),
    )

    const result = await zeroXClient.getPrice(mockParams)

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.sellAmount).toBe(1_000_000_000_000_000_000n)
    expect(result.data.buyAmount).toBe(3_500_000_000n)
    expect(result.data.price).toBeCloseTo(3500)
    expect(result.data.sources).toHaveLength(2)
    expect(result.data.sources[0].name).toBe('Uniswap_V3')
    expect(result.data.sources[0].proportion).toBeCloseTo(0.8)
  })

  it('returns error on HTTP failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ reason: 'Insufficient liquidity' }), { status: 400 }),
    )

    const result = await zeroXClient.getPrice(mockParams)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Insufficient liquidity')
  })

  it('returns error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    const result = await zeroXClient.getPrice(mockParams)

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Network error')
  })
})

describe('zeroXClient.getQuote', () => {
  it('returns firm quote with transaction data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        sellAmount: '1000000000000000000',
        buyAmount: '3500000000',
        route: { fills: [] },
        transaction: {
          to: '0x0000000000001fF3684f28c67538d4D072C22734',
          data: '0xabcdef',
          value: '1000000000000000000',
          gas: '200000',
        },
      }), { status: 200 }),
    )

    const result = await zeroXClient.getQuote(mockParams)

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.transaction).toBeDefined()
    expect(result.data.transaction.to).toBe('0x0000000000001fF3684f28c67538d4D072C22734')
    expect(result.data.transaction.data).toBe('0xabcdef')
    expect(result.data.transaction.value).toBe(1_000_000_000_000_000_000n)
    expect(result.data.transaction.gas).toBe(200_000n)
  })

  it('calls the /quote endpoint not /price', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        sellAmount: '1000000000000000000',
        buyAmount: '3500000000',
        route: { fills: [] },
        transaction: { to: '0x00', data: '0x', value: '0', gas: '0' },
      }), { status: 200 }),
    )

    await zeroXClient.getQuote(mockParams)

    const url = new URL(fetchSpy.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/swap/allowance-holder/quote')
  })
})
