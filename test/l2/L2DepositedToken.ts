import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { ethers } from 'hardhat'

import { Dai__factory, L2DepositedToken__factory } from '../../typechain'
import { deploy, deployMock } from '../helpers'

const errorMessages = {
  invalidMessenger: 'OVM_XCHAIN: messenger contract unauthenticated',
  invalidXDomainMessageOriginator: 'OVM_XCHAIN: wrong sender of cross-domain message',
  alreadyInitialized: 'Contract has already been initialized',
  notInitialized: 'Contract has not yet been initialized',
  daiInsufficientAllowance: 'Dai/insufficient-allowance',
  daiInsufficientBalance: 'Dai/insufficient-balance',
}

describe('OVM_L2DepositedToken', () => {
  describe('finalizeDeposit', () => {
    const depositAmount = 100

    it('mints new tokens', async () => {
      const [_, l2MessengerImpersonator, user1] = await ethers.getSigners()
      const { L1ERC20GatewayMock, l2CrossDomainMessengerMock, l2Minter } = await setupTest({
        l2MessengerImpersonator,
        user1,
      })
      l2CrossDomainMessengerMock.smocked.xDomainMessageSender.will.return.with(() => L1ERC20GatewayMock.address)

      await l2Minter.connect(l2MessengerImpersonator).finalizeDeposit(user1.address, depositAmount)
    })

    it('reverts when called not by XDomainMessenger', async () => {
      const [_, l2MessengerImpersonator, user1, user2] = await ethers.getSigners()
      const { L1ERC20GatewayMock, l2CrossDomainMessengerMock, l2Minter } = await setupTest({
        l2MessengerImpersonator,
        user1,
      })
      l2CrossDomainMessengerMock.smocked.xDomainMessageSender.will.return.with(() => L1ERC20GatewayMock.address)

      await expect(l2Minter.connect(user2).finalizeDeposit(user1.address, depositAmount)).to.be.revertedWith(
        errorMessages.invalidMessenger,
      )
    })

    it('reverts when called by XDomainMessenger but not relying message from l2Minter', async () => {
      const [_, l2MessengerImpersonator, user1, user2] = await ethers.getSigners()
      const { l2CrossDomainMessengerMock, l2Minter } = await setupTest({
        l2MessengerImpersonator,
        user1,
      })
      l2CrossDomainMessengerMock.smocked.xDomainMessageSender.will.return.with(() => user2.address)

      await expect(
        l2Minter.connect(l2MessengerImpersonator).finalizeDeposit(user1.address, depositAmount),
      ).to.be.revertedWith(errorMessages.invalidXDomainMessageOriginator)
    })
  })

  describe('withdraw', () => {
    const withdrawAmount = 100

    it('sends xchain message and burns tokens', async () => {
      const [_, l2MessengerImpersonator, user1] = await ethers.getSigners()
      const { L1ERC20GatewayMock, l2CrossDomainMessengerMock, l2Dai, l2Minter } = await setupWithdrawTest({
        l2MessengerImpersonator,
        user1,
      })

      await l2Minter.connect(user1).withdraw(withdrawAmount)
      const withdrawCallToMessengerCall = l2CrossDomainMessengerMock.smocked.sendMessage.calls[0]

      expect(await l2Dai.balanceOf(user1.address)).to.equal(INITIAL_TOTAL_L1_SUPPLY - withdrawAmount)
      expect(await l2Dai['totalSupply()']()).to.equal(INITIAL_TOTAL_L1_SUPPLY - withdrawAmount)

      expect(withdrawCallToMessengerCall._target).to.equal(L1ERC20GatewayMock.address)
      expect(withdrawCallToMessengerCall._message).to.equal(
        L1ERC20GatewayMock.interface.encodeFunctionData('finalizeWithdrawal', [user1.address, withdrawAmount]),
      )
    })

    it('reverts when approval is too low', async () => {
      const [_, l2MessengerImpersonator, user1, user2] = await ethers.getSigners()
      const { l2Dai, l2Minter } = await setupWithdrawTest({
        l2MessengerImpersonator,
        user1,
      })
      await l2Dai.connect(user1).transfer(user2.address, withdrawAmount)

      await expect(l2Minter.connect(user2).withdraw(withdrawAmount)).to.be.revertedWith(
        errorMessages.daiInsufficientAllowance,
      )
    })

    it('reverts when not enough funds', async () => {
      const [_, l2MessengerImpersonator, user1, user2] = await ethers.getSigners()
      const { l2Dai, l2Minter } = await setupWithdrawTest({
        l2MessengerImpersonator,
        user1,
      })
      await l2Dai.connect(user1).approve(l2Minter.address, withdrawAmount)

      await expect(l2Minter.connect(user2).withdraw(withdrawAmount)).to.be.revertedWith(
        errorMessages.daiInsufficientBalance,
      )
    })
  })

  describe('withdrawTo', () => {
    const withdrawAmount = 100

    it('sends xchain message and burns tokens', async () => {
      const [_, l2MessengerImpersonator, receiver, user1] = await ethers.getSigners()
      const { L1ERC20GatewayMock, l2CrossDomainMessengerMock, l2Dai, l2Minter } = await setupWithdrawTest({
        l2MessengerImpersonator,
        user1,
      })

      await l2Minter.connect(user1).withdrawTo(receiver.address, withdrawAmount)
      const withdrawCallToMessengerCall = l2CrossDomainMessengerMock.smocked.sendMessage.calls[0]

      expect(await l2Dai.balanceOf(user1.address)).to.equal(INITIAL_TOTAL_L1_SUPPLY - withdrawAmount)
      expect(await l2Dai.totalSupply()).to.equal(INITIAL_TOTAL_L1_SUPPLY - withdrawAmount)

      expect(withdrawCallToMessengerCall._target).to.equal(L1ERC20GatewayMock.address)
      expect(withdrawCallToMessengerCall._message).to.equal(
        L1ERC20GatewayMock.interface.encodeFunctionData('finalizeWithdrawal', [receiver.address, withdrawAmount]),
      )
    })

    it('reverts when approval is too low', async () => {
      const [_, l2MessengerImpersonator, receiver, user1, user2] = await ethers.getSigners()
      const { l2Dai, l2Minter } = await setupWithdrawTest({
        l2MessengerImpersonator,
        user1,
      })
      await l2Dai.connect(user1).transfer(user2.address, withdrawAmount)

      await expect(l2Minter.connect(user2).withdrawTo(receiver.address, withdrawAmount)).to.be.revertedWith(
        errorMessages.daiInsufficientAllowance,
      )
    })

    it('reverts when not enough funds', async () => {
      const [_, l2MessengerImpersonator, receiver, user1, user2] = await ethers.getSigners()
      const { l2Dai, l2Minter } = await setupWithdrawTest({
        l2MessengerImpersonator,
        user1,
      })
      await l2Dai.connect(user1).approve(l2Minter.address, withdrawAmount)

      await expect(l2Minter.connect(user2).withdrawTo(receiver.address, withdrawAmount)).to.be.revertedWith(
        errorMessages.daiInsufficientBalance,
      )
    })
  })

  describe('init', () => {
    it('sets token gateway', async () => {
      const [acc1, acc2, acc3] = await ethers.getSigners()

      const l2Minter = await deploy<L2DepositedToken__factory>('L2DepositedToken', [acc1.address, acc2.address])

      await l2Minter.init(acc3.address)

      expect(await l2Minter.l1TokenGateway()).to.eq(acc3.address)
    })

    it('allows initialization once not multiple times', async () => {
      const [acc1, acc2, acc3] = await ethers.getSigners()

      const l2Minter = await deploy<L2DepositedToken__factory>('L2DepositedToken', [acc1.address, acc2.address])

      await l2Minter.init(acc3.address)

      await expect(l2Minter.init(acc3.address)).to.be.revertedWith(errorMessages.alreadyInitialized)
    })

    it('doesnt allow calls to onlyInitialized functions before initialization', async () => {
      const [acc1, acc2, acc3] = await ethers.getSigners()

      const l2Minter = await deploy<L2DepositedToken__factory>('L2DepositedToken', [acc1.address, acc2.address])

      await expect(l2Minter.withdraw('100')).to.be.revertedWith(errorMessages.notInitialized)
      await expect(l2Minter.withdrawTo(acc3.address, '100')).to.be.revertedWith(errorMessages.notInitialized)
      await expect(l2Minter.finalizeDeposit(acc3.address, '100')).to.be.revertedWith(errorMessages.notInitialized)
    })
  })
})

async function setupTest(signers: { l2MessengerImpersonator: SignerWithAddress; user1: SignerWithAddress }) {
  const l2CrossDomainMessengerMock = await deployMock(
    'OVM_L2CrossDomainMessenger',
    { address: await signers.l2MessengerImpersonator.getAddress() }, // This allows us to use an ethers override {from: Mock__OVM_L2CrossDomainMessenger.address} to mock calls
  )
  const l2Dai = await deploy<Dai__factory>('Dai', [])
  const l2Minter = await deploy<L2DepositedToken__factory>('L2DepositedToken', [
    l2CrossDomainMessengerMock.address,
    l2Dai.address,
  ])
  const L1ERC20GatewayMock = await deployMock('L1ERC20Gateway')

  await l2Dai.rely(l2Minter.address)
  await l2Minter.init(L1ERC20GatewayMock.address)

  return { l2Dai, L1ERC20GatewayMock, l2CrossDomainMessengerMock, l2Minter }
}

const INITIAL_TOTAL_L1_SUPPLY = 3000

async function setupWithdrawTest(signers: { l2MessengerImpersonator: SignerWithAddress; user1: SignerWithAddress }) {
  const contracts = await setupTest(signers)

  await contracts.l2Dai.mint(signers.user1.address, INITIAL_TOTAL_L1_SUPPLY)
  await contracts.l2Dai.connect(signers.user1).approve(contracts.l2Minter.address, ethers.constants.MaxUint256)

  return contracts
}
