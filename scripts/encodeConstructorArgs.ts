import hre from 'hardhat'

// useful for getting abi encoded constructor args required by etherscan verification

async function main() {
  const deployTx = hre.ethers.utils.defaultAbiCoder.encode(['address'], ['0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1'])

  console.log(deployTx)
}

main()
  .then(() => console.log('DONE'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
