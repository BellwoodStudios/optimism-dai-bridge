/**
 * Full kovan deploy including any permissions that need to be set.
 */
require('dotenv').config()
import { JsonRpcProvider } from '@ethersproject/providers'
import hre from 'hardhat'
import { mapValues } from 'lodash'

import { getRequiredEnv } from './common'
import { deployL2TestSpell } from './commonL2TestSpell'

// optimism's addresses: https://github.com/ethereum-optimism/optimism/tree/master/packages/contracts/deployments

const L1_KOVAN_RPC_URL = getRequiredEnv('L1_KOVAN_RPC_URL')
const L1_KOVAN_DEPLOYER_PRIV_KEY = getRequiredEnv('L1_KOVAN_DEPLOYER_PRIV_KEY')
const L2_KOVAN_RPC_URL = getRequiredEnv('L2_KOVAN_RPC_URL')
const L2_KOVAN_DEPLOYER_PRIV_KEY = getRequiredEnv('L2_KOVAN_DEPLOYER_PRIV_KEY')

const L2_KOVAN_DAI_ADDRESS = '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1'

async function main() {
  console.log('Deploying on kovan')
  const l1Provider = new JsonRpcProvider(L1_KOVAN_RPC_URL)
  const l1Deployer = new hre.ethers.Wallet(L1_KOVAN_DEPLOYER_PRIV_KEY, l1Provider)

  const l2Provider = new JsonRpcProvider(L2_KOVAN_RPC_URL)
  const l2Deployer = new hre.ethers.Wallet(L2_KOVAN_DEPLOYER_PRIV_KEY, l2Provider)

  const deploymentInfo = await deployL2TestSpell({
    l1Deployer: l1Deployer,
    l2Deployer: l2Deployer,
    L2_DAI_ADDRESS: L2_KOVAN_DAI_ADDRESS,
    L1_TX_OPTS: {
      gasPrice: 3000000000, // 3 gwei
    },
    L2_TX_OPTS: {},
  })

  const deploymentAddresses = mapValues(deploymentInfo, (v) => v.address)

  console.log(JSON.stringify(deploymentAddresses, null, 2))
}

main()
  .then(() => console.log('DONE'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
