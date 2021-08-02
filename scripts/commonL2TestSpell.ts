import { Signer } from '@ethersproject/abstract-signer'

import { deployUsingFactoryAndVerify, getL2Factory, MAX_UINT256, waitForTx } from '../test-e2e/helpers/utils'

interface Options {
  l1Deployer: Signer
  l2Deployer: Signer

  L2_DAI_ADDRESS: string

  L1_TX_OPTS: Object
  L2_TX_OPTS: Object
}

export async function deployL2TestSpell(opts: Options) {
  const l2TestSpell = await deployUsingFactoryAndVerify(opts.l2Deployer, await getL2Factory('L2TestSpell'), [
    opts.L2_DAI_ADDRESS,
    opts.L2_TX_OPTS,
  ])

  return {
    l2TestSpell,
  }
}
