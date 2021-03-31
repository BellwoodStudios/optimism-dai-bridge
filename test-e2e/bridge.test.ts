import { Wallet } from '@ethersproject/wallet'
import { expect } from 'chai'
import { Contract } from 'ethers'
import { ethers as l1, l2ethers as l2 } from 'hardhat'

import {
  Dai,
  L1ERC20Gateway,
  L1GovernanceRelay,
  L2DepositedToken,
  L2GovernanceRelay,
  TestBridgeUpgradeSpell,
} from '../typechain'
import { optimismConfig } from './helpers/optimismConfig'
import {
  deployContract,
  MAX_UINT256,
  q18,
  setupTest,
  waitForTx,
  waitToRelayMessageToL1,
  waitToRelayTxsToL2,
} from './helpers/utils'

describe('bridge', () => {
  let l1Signer: Wallet
  let l1Escrow: Wallet
  let l2Signer: Wallet
  let watcher: any

  let l1Dai: Dai
  let l1DaiDeposit: Contract
  let l1DaiDepositV2: Contract
  let l1GovernanceRelay: Contract
  let l2Dai: Contract
  let l2Minter: Contract
  let l2MinterV2: Contract
  let l2GovernanceRelay: Contract
  let l2UpgradeSpell: Contract
  const initialL1DaiNumber = q18(10000)
  const spellGasLimit = 5000000

  beforeEach(async () => {
    ;({ l1Signer, l2Signer, watcher, l1User: l1Escrow } = await setupTest())
    l1Dai = await deployContract<Dai>(l1Signer, await l1.getContractFactory('Dai'), [])
    console.log('L1 DAI: ', l1Dai.address)
    await waitForTx(l1Dai.mint(l1Signer.address, initialL1DaiNumber))

    l2Dai = await deployContract<Dai>(l2Signer, await l2.getContractFactory('Dai'), [])
    console.log('L2 DAI: ', l2Dai.address)

    l2Minter = await deployContract<L2DepositedToken>(l2Signer, await l2.getContractFactory('L2DepositedToken'), [
      optimismConfig._L2_OVM_L2CrossDomainMessenger,
      l2Dai.address,
    ])
    console.log('L2 Minter: ', l2Minter.address)

    l1DaiDeposit = await deployContract<L1ERC20Gateway>(l1Signer, await l1.getContractFactory('L1ERC20Gateway'), [
      l1Dai.address,
      l2Minter.address,
      optimismConfig.Proxy__OVM_L1CrossDomainMessenger,
      l1Escrow.address,
    ])
    await l1Dai.connect(l1Escrow).approve(l1DaiDeposit.address, MAX_UINT256)
    console.log('L1 DAI Deposit: ', l1DaiDeposit.address)

    await waitForTx(l2Minter.init(l1DaiDeposit.address))
    console.log('L2 DAI initialized...')

    l2GovernanceRelay = await deployContract<L2GovernanceRelay>(
      l2Signer,
      await l2.getContractFactory('L2GovernanceRelay'),
      [optimismConfig._L2_OVM_L2CrossDomainMessenger],
    )
    console.log('L2 Governance Relay: ', l2Minter.address)

    l1GovernanceRelay = await deployContract<L1GovernanceRelay>(
      l1Signer,
      await l1.getContractFactory('L1GovernanceRelay'),
      [l2GovernanceRelay.address, optimismConfig.Proxy__OVM_L1CrossDomainMessenger],
    )
    console.log('L1 Governance Relay: ', l1GovernanceRelay.address)

    await waitForTx(l2GovernanceRelay.init(l1GovernanceRelay.address))
    console.log('Governance relay initialized...')

    await waitForTx(l2Dai.rely(l2Minter.address))
    await waitForTx(l2Dai.rely(l2GovernanceRelay.address))
    await waitForTx(l2Dai.deny(l2Signer.address))
    await waitForTx(l2Minter.transferOwnership(l2GovernanceRelay.address))
    console.log('Permissions updated...')
  })

  it('moves l1 tokens to l2', async () => {
    const depositAmount = q18(500)
    await waitForTx(l1Dai.approve(l1DaiDeposit.address, depositAmount))
    await waitToRelayTxsToL2(l1DaiDeposit.deposit(depositAmount), watcher)

    const balance = await l2Dai.balanceOf(l1Signer.address)
    expect(balance.toString()).to.be.eq(depositAmount)
  })

  it('moves l2 tokens to l1', async () => {
    const depositAmount = q18(500)
    await waitForTx(l1Dai.approve(l1DaiDeposit.address, depositAmount))
    await waitToRelayTxsToL2(l1DaiDeposit.deposit(depositAmount), watcher)

    const balance = await l2Dai.balanceOf(l1Signer.address)
    expect(balance.toString()).to.be.eq(depositAmount)

    await waitForTx(l2Dai.approve(l2Minter.address, depositAmount))
    await waitToRelayMessageToL1(l2Minter.withdraw(depositAmount), watcher)

    const l2BalanceAfterWithdrawal = await l2Dai.balanceOf(l1Signer.address)
    expect(l2BalanceAfterWithdrawal.toString()).to.be.eq('0')
    const l1Balance = await l1Dai.balanceOf(l1Signer.address)
    expect(l1Balance.toString()).to.be.eq(initialL1DaiNumber)
  })

  it('upgrades the bridge through governance relay', async () => {
    l2MinterV2 = await deployContract<L2DepositedToken>(l2Signer, await l2.getContractFactory('L2DepositedToken'), [
      optimismConfig._L2_OVM_L2CrossDomainMessenger,
      l2Dai.address,
    ])
    console.log('L2 Minter V2: ', l2MinterV2.address)

    l1DaiDepositV2 = await deployContract<L1ERC20Gateway>(l1Signer, await l1.getContractFactory('L1ERC20Gateway'), [
      l1Dai.address,
      l2MinterV2.address,
      optimismConfig.Proxy__OVM_L1CrossDomainMessenger,
      l1Escrow.address,
    ])
    await l1Dai.connect(l1Escrow).approve(l1DaiDepositV2.address, MAX_UINT256)
    console.log('L1 DAI Deposit V2: ', l1DaiDepositV2.address)

    await waitForTx(l2MinterV2.init(l1DaiDepositV2.address))
    console.log('L2 Bridge initialized...')

    l2UpgradeSpell = await deployContract<TestBridgeUpgradeSpell>(
      l2Signer,
      await l2.getContractFactory('TestBridgeUpgradeSpell'),
      [],
    )
    console.log('L2 Bridge Upgrade Spell: ', l2UpgradeSpell.address)

    // Close L1 bridge V1
    await l1DaiDeposit.connect(l1Signer).close()
    console.log('L1 Bridge Closed')

    // Close L2 bridge V1
    await l1GovernanceRelay
      .connect(l1Signer)
      .relay(
        l2UpgradeSpell.address,
        l2UpgradeSpell.interface.encodeFunctionData('upgradeBridge', [l2Minter.address, l2MinterV2.address]),
        spellGasLimit,
      )
    console.log('L2 Bridge Closed')

    console.log('Testing V2 bridge deposit/withdrawal...')
    const depositAmount = q18(500)
    await waitForTx(l1Dai.approve(l1DaiDepositV2.address, depositAmount))
    await waitToRelayTxsToL2(l1DaiDepositV2.deposit(depositAmount), watcher)

    const balance = await l2Dai.balanceOf(l1Signer.address)
    expect(balance.toString()).to.be.eq(depositAmount)

    await waitForTx(l2Dai.approve(l2MinterV2.address, depositAmount))
    await waitToRelayMessageToL1(l2MinterV2.withdraw(depositAmount), watcher)

    const l2BalanceAfterWithdrawal = await l2Dai.balanceOf(l1Signer.address)
    expect(l2BalanceAfterWithdrawal.toString()).to.be.eq('0')
    const l1Balance = await l1Dai.balanceOf(l1Signer.address)
    expect(l1Balance.toString()).to.be.eq(initialL1DaiNumber)
  })
})
