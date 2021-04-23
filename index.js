const csv = require("csvtojson")
const chalk = require('chalk')
const { spawn, exec } = require('child_process')
const fs = require('fs')

let progressToLog = 0

async function main() {
  const plants = await csv().fromFile('./input.csv')

  await runTask(
    'Initializing mt and pt databases',
    sh('get_organelle_config.py', ['-a', 'embplant_pt,embplant_mt'])
  )


  /**
   * Get progress
   */
  let i
  try {
    i = parseInt(fs.readFileSync('./progress').toString())
  } catch (e) {
    i = 0
  }

  /**
  * Iterate over all plants
  */
  for (; i < plants.length; i++) {
    progressToLog = i / plants.length * 100 >> 0


    /**
     * Prepare plant's data
     */
    const { sra, order, family, genus } = plants[i]
    const dir = `data/${order}/${family}/${genus}.${sra}`
    const fq1 = `${sra}_1.fastq`
    const fq2 = `${sra}_2.fastq`


    /**
     * Fetch SRA
     */
    await runTask(
      'Removing existing SRR files',
      exec('rm -rf SRR*')
    )
    await runTask(
      `Fetching ${sra}`,
      sh('prefetch', ['-p', sra, '--max-size', '150G'])
    )
    await runTask(
      `Spliting ${sra}`,
      sh('fastq-dump', ['-I', '--split-files', sra])
    )
    await runTask(
      'Removing tmp files',
      exec('rm -rf ' + sra)
    )


    /**
     * Create dirs
     */
    await runTask(
      'Create dirs',
      exec(`mkdir -p ${dir}`)
    )


    /**
     * Run Pt and Mt getOrganelle scripts
     */
    await runTask(
      `Get organelle Pt from ${sra} reads`,
      sh(...getOrganelleCommand('embplant_pt', `${dir}/pt`, fq1, fq2))
    )
    await runTask(
      `Get organelle Mt from ${sra} reads`,
      sh(...getOrganelleCommand('embplant_mt', `${dir}/mt`, fq1, fq2))
    )


    /**
     * Remove fq files
     */
    await runTask(
      'Removing fastq files',
      exec(`rm ${fq1} ${fq2}`)
    )
    
    await runTask(
       'Saving progress',
       fs.writeFileSync('progress', i.toString())
    )
  } // End of loop
}

main()


/**
 * Utils
 */
function log(...args) {
  process.stdout.write(chalk.yellow(progressToLog + '%') + ' ')
  console.log(...args)
}

function write(...args) {
  process.stdout.write(...args)
}

function getOrganelleCommand(type, output, fq1, fq2) {
  return [
    'get_organelle_from_reads.py',
    ['-1', fq1, '-2', fq2, '-o', output, '-R', '30', '-k', '21,45,65,85,105', '-F', type, '-t', '24']
  ]
}

async function runTask(task, cb) {
  const createDate = () => chalk.magenta(new Date().toLocaleString() + ':')
  log(`${createDate()} ${task}...`)
  const result = await cb
  log(`${createDate()} ${task} ${chalk.green('DONE')}`)
  return result
}

function sh(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(...args)

    child.stdout.on('data', data => {
      write(chalk.grey(data.toString()))
    })

    child.stderr.on('data', data => {
      error(data.toString())
    })

    child.on('close', code => {
      code === 0 ? resolve(code) : reject(code)
    })
  })
}
