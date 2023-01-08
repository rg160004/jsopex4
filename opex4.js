// Copyright (c) 2022, OpEX Team and contributors
// For license information, please see license.txt

let isUiCleanupListenersInitDone = false
let isUiCleanupRequired = false
let allowSave = true;

// global constants prefixed with 'k_'
// lets do the file attach field rejection with a msg box. as in we show a popup alert waala ?YEsss frm. message() ok got it. thanks.
const k_bestPracticesTableName = 'identified'
const k_findingsTableNames = [
  'major_nc',
  'minor_nc',
  'obs',
  'ofi',
  'exceptions',
  'no_evidence',
]
const k_closedFindingsTableName = 'closed_findings'

const k_ignoredFields = [
  'creation',
  'docstatus',
  'doctype',
  'idx',
  'modified',
  'modified_by',
  'name',
  'owner',
  'parent',
  'parentfield',
  'parenttype',
  'bcsla_code',
]

const k_formStatuses = {
  EXITED: 'Exited',
  REVIEWED: 'Reviewed',
  INITIATED: 'Initiated',
}

const k_XssDisablingRegex = new RegExp("[<>]")


//Global vars
let cell,
  prevPracticeName,
  isLastIndex = null
let isExSelectionNegative,
  isWoExSelectionNegative = false,
  isExit = false,
  isReview = false
let totalExAvg = 0,
  totalWoExAvg = 0
let nNonSelecion = 0,
  totalPracticeCount = 0,
  tablePracticeCount = 0,
  totalRowsCount = 0,
  totalAccountCount = 0,
  totalEvidence = 0,
  nEvidence = 0,
  nEvAccepted = 0
let practiceTableRows = [],
  moduleAvgTableRows = [],
  bestPracticeRows = []
let isNotApplicable = false,
  isNoEvidence = false,
  isPracticeEmpty = false,
  isNegativeAndCritical = false,
  napCount = 0,
  isEmptySelection = false,
  shouldCalculateScore = false
const exMaturitySet = new Set()
const woExmaturitySet = new Set()
let findingsDataMap = {}

const selectionTypesWithEx = {
  Yes: 1,
  Exception: 1,
  'Not Applicable': 1,
  No: 0,
  '-': null,
  'No Sample': 1,
  'No Evidence': 0,
}
const selectionTypesWoEx = {
  Yes: 1,
  Exception: 0,
  'Not Applicable': 1,
  No: 0,
  '-': null,
  'No Sample': 0,
  'No Evidence': 0,
}
const maturityScoresMap = {
  LAGGING: 1,
  INITIAL: 2,
  'DEFINED & DEVELOPING': 3,
  ESTABLISHED: 4,
  LEADING: 5,
}

// const getPlannerDocName = frm =>
//   `${frm.doc.client_name}-${frm.doc.processlob}-${frm.doc.bcsla_code}-${frm.doc.intervention_type}`

// TODO: ask what isCell is for. it is not currently used
const resetGlobalVars = isCell => {
  exMaturitySet.clear()
  woExmaturitySet.clear()
  if (!isCell) {
    cell = null
    isLastIndex = null
    isExSelectionNegative = false
    isWoExSelectionNegative = false
  }
  prevPracticeName = null
}

const isSelectionNotApplicable = selection =>
  selection === 'Not Applicable' || selection === 'Exception'

const isSelectionNoEvidence = selection => selection === 'No Evidence'

const isSelectionNegOrEmpty = cell =>
  (cell.selection === '-' ||
    cell.selection === 'No' ||
    cell.selection === 'No Evidence') &&
  cell.critical_to_opex === 'Yes'

const calculateResult = (
  cell,
  maturitySet,
  selectionType,
  result,
  isExceptionType,
  shouldReset
) => {
  //Check if it reaches another practice group -> reset all values
  if (prevPracticeName !== cell.practice || isLastIndex) {
    const selection = selectionType[cell.selection]
    if (!isEmptySelection) isEmptySelection = selection === null
    //Check and add current maturity_level at last index
    if (
      isLastIndex &&
      selection &&
      !(isExceptionType ? isExSelectionNegative : isWoExSelectionNegative)
    )
      maturitySet.add(cell.maturity_level)
    //Assign result to practice group
    if (prevPracticeName) {
      const matList = [...maturitySet]
      // console.log(prevPracticeName, isCritical, isNegativeOrEmpty)
      const finalMatLevel = isPracticeEmpty
        ? 'No Evidence'
        : isNegativeAndCritical
        ? 'LAGGING'
        : !matList.length
        ? 'No Evidence'
        : (isExceptionType ? isExSelectionNegative : isWoExSelectionNegative)
        ? matList[matList.length - 2] ?? 'LAGGING'
        : matList[matList.length - 1]
      result[
        isLastIndex && !prevPracticeName ? cell.practice : prevPracticeName
      ] = {
        score:
          isNotApplicable || isNoEvidence
            ? 0
            : maturityScoresMap[finalMatLevel] || 0,
        maturity_level: isNotApplicable
          ? 'Not Applicable'
          : isNoEvidence
          ? 'No Evidence'
          : finalMatLevel,
      }
      maturitySet.clear()
      if (shouldReset) {
        isEmptySelection = false
        if (!isNotApplicable) {
          totalPracticeCount++
          tablePracticeCount++
        }
        isNotApplicable = isSelectionNotApplicable(cell.selection)
        isNoEvidence = isSelectionNoEvidence(cell.selection)
        isNegativeAndCritical = isSelectionNegOrEmpty(cell)
        isPracticeEmpty = cell.selection === '-'
      }
    }

    if (!selection && selection !== null) maturitySet.add(cell.maturity_level)

    if (isExceptionType) isExSelectionNegative = !selection
    else isWoExSelectionNegative = !selection
  }
  //If selection is positive
  if (
    !(isExceptionType ? isExSelectionNegative : isWoExSelectionNegative) &&
    selectionType[cell.selection]
  )
    maturitySet.add(cell.maturity_level)
  //If selection is negative
  else {
    if (!(isExceptionType ? isExSelectionNegative : isWoExSelectionNegative)) {
      maturitySet.add(cell.maturity_level)
      if (isExceptionType) isExSelectionNegative = true
      else isWoExSelectionNegative = true
    }
  }
}

const getModuleName = module =>
  module.replace('_table', '').split('_').join(' ')

// const populateFindings = (module, rows, frm) => {
// module = getModuleName(module)
// let keyName
// for (let row of rows) {
//   keyName = null
//   if (row.selection === 'No') keyName = row.severity
//   else if (row.selection === 'No Evidence') keyName = row.selection
//   else if (row.selection === 'Exception') keyName = 'Exceptions'
//   // console.log('keyname', keyName)
//   if (keyName) {
//     // console.log('in keyname if')
//     if (
//       row.selection === 'No' ||
//       row.selection === 'No Evidence' ||
//       row.selection === 'Exception'
//     ) {
//       row.finding = 'yes'
//       // console.log('in mid if')
//       // if (frm.doc.form_status === k_formStatuses.EXITED || isExit) {
//       // console.log('POP ROW', row)
//       if (!row.finding_raised_date)
//         row.finding_raised_date = frappe.datetime.get_today()
//       // console.log('ADDED', row.finding_raised_date)
//       // }
//       row.ageing = row.finding_raised_date
//         ? frappe.datetime.get_day_diff(
//             frappe.datetime.get_today(),
//             row.finding_raised_date
//           )
//         : 0
//     }
//     const v = { ...row, module }
//     if (!findingsDataMap[keyName]) findingsDataMap[keyName] = [v]
//     else findingsDataMap[keyName].push(v)
//   }
// }
// }

/**
 *
 * @param {} tableName name of the table: String
 * @param {} cells entries is table tableName
 * @param {} frm form
 */
// TODO: ask what business logic
const analyzeCells = (tableName, cells, frm) => {
  const resultWIthEx = {}
  const resultWoEx = {}
  tablePracticeCount = 0
  resetGlobalVars()
  if (cells && cells.length) {
    let cell
    for (let cIdx in cells) {
      cell = cells[cIdx]
      if (cell) {
        isLastIndex = cIdx == cells.length - 1

        if ((isLastIndex && isNotApplicable) || !prevPracticeName)
          isNotApplicable = isSelectionNotApplicable(cell.selection)

        if ((isLastIndex && isNoEvidence) || !prevPracticeName)
          isNoEvidence = isSelectionNoEvidence(cell.selection)

        if ((isLastIndex && !isNegativeAndCritical) || !prevPracticeName)
          isNegativeAndCritical = isSelectionNegOrEmpty(cell)

        if ((isLastIndex && isPracticeEmpty) || !prevPracticeName)
          isPracticeEmpty = cell.selection === '-'

        // if ((isLastIndex && isCritical) || !prevPracticeName)
        //   isCritical = cell.critical_to_opex === 'Yes'

        calculateResult(
          cell,
          exMaturitySet,
          selectionTypesWithEx,
          resultWIthEx,
          true
        )
        calculateResult(
          cell,
          woExmaturitySet,
          selectionTypesWoEx,
          resultWoEx,
          false,
          true
        )
        prevPracticeName = cell.practice
        //Check if all rows in a group is Not Applicable
        if (isNotApplicable)
          isNotApplicable = isSelectionNotApplicable(cell.selection)
        if (isNoEvidence) isNoEvidence = isSelectionNoEvidence(cell.selection)
        if (!isNegativeAndCritical)
          isNegativeAndCritical = isSelectionNegOrEmpty(cell)
        if (isPracticeEmpty) isPracticeEmpty = cell.selection === '-'

        // if (isCritical) isCritical = cell.critical_to_opex === 'Yes'
      }
      if (cell.selection === '-') nNonSelecion++

      totalRowsCount++
      // if (cell.best_practice) bestPracticeRows.push(cell)
    }
    // populateFindings(tableName, cells, frm)
  }
  let exAvg = 0,
    woExAvg = 0
  Object.keys(resultWIthEx).forEach(k => {
    const row = {
      practice: k,
      maturity_level_exception: resultWIthEx[k].maturity_level,
      maturity_level_wo_exception: resultWoEx[k].maturity_level,
      score_exception: resultWIthEx[k].score,
      score_wo_exception: resultWoEx[k].score,
    }
    practiceTableRows.push(row)
    exAvg += row.score_exception
    woExAvg += row.score_wo_exception
    totalExAvg += row.score_exception
    totalWoExAvg += row.score_wo_exception
    if (row.maturity_level_exception != 'Not Applicable') totalAccountCount++
  })
  exAvg = ((exAvg / tablePracticeCount) * 2).toFixed(2)
  woExAvg = ((woExAvg / tablePracticeCount) * 2).toFixed(2)
  moduleAvgTableRows.push({
    module: getModuleName(tableName),
    score_exception: exAvg,
    score_wo_exception: woExAvg,
  })
}

const makeModuleMap = (list, keyName) => {
  const m = {}
  list.forEach(v => {
    m[v[keyName]] = v
  })
  return m
}

const startAnalyzing = async frm => {
  // if (frm.is_new() || !frm.is_dirty()) {
  //   console.log('Nothing to analyze')
  //   return
  // }
  const timeStamp = new Date().getTime()
  console.log('Started at ', new Date(timeStamp))
  //Reset Vars
  nNonSelecion = 0
  totalRowsCount = 0
  totalPracticeCount = 0
  totalAccountCount = 0
  totalExAvg = 0
  totalWoExAvg = 0
  practiceTableRows = []
  moduleAvgTableRows = []
  // console.log(frm && frm.doc)
  if (frm && frm.doc) {
    const doc = frm.doc
    Object.keys(doc).forEach(k => {
      const cells = doc[k]

      if (k.includes('_table') && !k.includes('artifact'))
        analyzeCells(k, cells, frm)
      if (k.includes('artifact')) {
        if (cells && cells.length)
          cells.forEach(d => {
            totalEvidence++
            if (d.attach_files) nEvidence++
            if (d.accepted_status_opex === 'Accepted') nEvAccepted++
          })
      }
    })

    if (shouldCalculateScore) {
      // calculating appraisal details tab statistics
      const completionAvg = (nNonSelecion / totalRowsCount) * 100
      frm.set_value(
        'form_completion',
        `${(100.0 - +completionAvg).toFixed(2)}%`
      )
      frm.set_value(
        'evidence_shared',
        `${((nEvidence / totalEvidence) * 100).toFixed(2)}%`
      )
      frm.set_value(
        'evidence_accepted',
        `${((nEvAccepted / totalEvidence) * 100).toFixed(2)}%`
      )
      shouldCalculateScore = false
    } else {
      //////// start here
      calculateAgeingForExistingFindings(frm, false)
      populateNewBestPractices(frm)
      populateNewFindings(frm)

      ///// Calculating scoring tab statistics
      // console.log('Evidence shared -> ', nEvidence, totalEvidence);
      if (!isNaN(totalExAvg))
        frm.set_value(
          'account_score_exception',
          ((totalExAvg / totalAccountCount) * 20).toFixed(2)
        )
      if (!isNaN(totalWoExAvg))
        frm.set_value(
          'account_score_wo_exception',
          ((totalWoExAvg / totalAccountCount) * 20).toFixed(2)
        )
      // console.log('module score list - ', moduleAvgTableRows);
      if (
        !(frm.doc.practice_score && frm.doc.practice_score.length) ||
        !(frm.doc.module_score && frm.doc.module_score.length)
      ) {
        cur_frm.clear_table('practice_score')
        cur_frm.clear_table('module_score')
        practiceTableRows.forEach(r => {
          frm.add_child('practice_score', r)
        })
        moduleAvgTableRows.forEach(r => {
          frm.add_child('module_score', r)
        })
      } else {
        console.log('Data exists!')
        const moduleScoreMap = makeModuleMap(frm.doc.module_score, 'module')
        const practiceScoreMap = makeModuleMap(
          frm.doc.practice_score,
          'practice'
        )
        practiceTableRows.forEach(r => {
          const rowRef = practiceScoreMap[r.practice]
          if (!rowRef) frm.add_child('practice_score', r)
          else
            Object.keys(r).forEach(k => {
              rowRef[k] = r[k]
            })
        })
        moduleAvgTableRows.forEach(r => {
          const rowRef = moduleScoreMap[r.module]
          if (!rowRef) frm.add_child('module_score', r)
          else
            Object.keys(r).forEach(k => {
              rowRef[k] = r[k]
            })
        })
      }
      if (isExit || isReview) {
        frm.trigger('perform_exit')
      }

      await frm.refresh_fields()
      console.log('Data analyzed in ', new Date().getTime() - timeStamp, ' ms')
      removeUndesiredUI() // sometimes frm.save() throws an error so this removeUndesiredUI() is required

      await frm.save()
      removeUndesiredUI()
      console.log('SAVED')
    }
  }
}

function populateNewBestPractices(frm) {
  const newBestPracticeRows = getNewBestPracticeRows(frm)

  console.log('best PRACTICE', newBestPracticeRows)

  newBestPracticeRows.forEach(rowElement => {
    const newEntry = frm.add_child(k_bestPracticesTableName)
    // console.log('ROW ELE: ', rowElement)
    newEntry.row_id = rowElement.row_id

    newEntry.module = getModuleName(rowElement.parentfield)
    newEntry.practice = rowElement.practice
    newEntry.question = rowElement.question
    newEntry.gdp_clause = rowElement.gdp_clause
    newEntry.iso_clause = rowElement.iso_clause

    newEntry.selection = rowElement.selection
    newEntry.severity = rowElement.severity

    newEntry.finding_detail = rowElement.finding_detail

    newEntry.opportunity_description = rowElement.opportunity_description
    newEntry.best_practice = rowElement.best_practice
    // console.log(newEntry)
  })
  frm.refresh_field(k_bestPracticesTableName)
  bestPracticeRows = []
}

function getNewBestPracticeRows(frm) {
  // potential optimization: sort prev ids, and binary search when filtering
  const existingBestPracticeRowIds = getExistingBestPracticeRowIds(frm)

  const checkListRows = getChecklistRows(frm)
  return checkListRows.filter(
    r => r.best_practice == 1 && !existingBestPracticeRowIds.includes(r.row_id)
  )
}

function getExistingBestPracticeRowIds(frm) {
  const doc = frm.doc
  const rows = doc[k_bestPracticesTableName]
  return rows.map(r => r.row_id)
}

function populateNewFindings(frm) {
  try {
    const findingsMap = getNewFindings(frm)

    console.log('new map: ', findingsMap)

    // keys if severity in findings map
    Object.keys(findingsMap).forEach(severity => {
      const rows = findingsMap[severity]
      // console.log('rows: ', rows)
      const severityTableName = severity.toLowerCase().split(' ').join('_')
      // console.log(severity, rows)
      if (severityTableName in frm.doc && rows && rows.length) {
        // frm.clear_table(severity)
        rows.forEach(rowElement => {
          if (rowElement.finding_raised_date == undefined)
            console.log('ROW ELE: ', rowElement)

          const newEntry = frm.add_child(severityTableName)

          newEntry.row_id = rowElement.row_id

          newEntry.module = getModuleName(rowElement.parentfield)
          newEntry.practice = rowElement.practice
          newEntry.selection = rowElement.selection
          newEntry.severity = rowElement.severity
          newEntry.opportunity_description = rowElement.opportunity_description
          newEntry.gdp_clause = rowElement.gdp_clause
          newEntry.iso_clause = rowElement.iso_clause
          newEntry.finding_detail = rowElement.finding_detail
          newEntry.question = rowElement.question
          // newEntry.finding_raised_date = rowElement.finding_raised_date

          // TODO: Refactor to avoid repetition
          newEntry.ageing =
            rowElement.finding_raised_date == undefined
              ? '-'
              : Math.floor(
                  (new Date().getTime() -
                    new Date(rowElement.finding_raised_date).getTime()) /
                    86400000
                ) + ' days'
        })
        frm.refresh_field(severityTableName)
      }
    })
  } catch (error) {
    ////////////end here
    console.log('Findings error:', error)
  }
}

/**
 * @param {} frm form
 * @returns new findings map, key is severity name and value is rows
 */
function getNewFindings(frm) {
  // potential optimization: sort prev ids, and binary search when filtering
  const existingFindingRowsIds = getExistingFindingsRowIds(frm)
  // console.log('existing findings ids: ', existingFindingsIds)

  let findings = {}
  let checkListRows = getChecklistRows(frm)

  const newFindingsRows = checkListRows.filter(
    row =>
      // check for row not already in findings
      !existingFindingRowsIds.includes(row.row_id) &&
      // checks for appropriate selections,
      // ie following is true is a row qualifies as a findings
      (row.selection === 'No' ||
        row.selection === 'No Evidence' ||
        row.selection === 'Exception')
  )

  for (let row of newFindingsRows) {
    // findings table to which this row must be inserted in
    let findingTableName = null
    if (row.selection === 'No') findingTableName = row.severity
    else if (row.selection === 'No Evidence') findingTableName = row.selection
    else if (row.selection === 'Exception') findingTableName = 'Exceptions'

    if (findingTableName) {
      row.finding = 'yes'
      // TODO: ask what this if does
      if (frm.doc.form_status === k_formStatuses.EXITED || isExit) {
      // console.log('POP ROW', row)
      if (!row.finding_raised_date) {
        row.finding_raised_date = frappe.datetime.get_today()
        row.ageing =
        rowElement.finding_raised_date == undefined
          ? '-'
          : Math.floor(
              (new Date().getTime() -
                new Date(rowElement.finding_raised_date).getTime()) /
                86400000
            ) + ' days'
          }
      // console.log('ADDED', row.finding_raised_date)
      }

      if (!findings[findingTableName]) findings[findingTableName] = [row]
      else findings[findingTableName].push(row)
    }
  }

  return findings
}

/**
 *
 * @param {} frm form
 * @returns an array of concatenated rows of all tables in the checklist tab
 */
function getChecklistRows(frm) {
  const checkListTables = getChecklistTables(frm)

  let checkListRows = []
  checkListTables.forEach(tableRows => {
    checkListRows = checkListRows.concat(tableRows)
  })

  return checkListRows
}

/**
 *
 * @param {} frm form
 * @returns a Array[ Map{k:tableName -> v:Array[table rows]} ] of tables in the checklist tab
 */
function getChecklistTables(frm) {
  const doc = frm.doc

  return Object.keys(doc)
    .filter(k => k.includes('_table') && !k.includes('artifact'))
    .map(k => doc[k])
}

function getExistingFindingsRowIds(frm) {
  const findings = getExistingFindings(frm)
  return findings.map(r => r.row_id)
}

function getExistingFindings(frm) {
  const doc = frm.doc

  const findingsTables = Object.keys(doc)
    .filter(k => k_findingsTableNames.includes(k))
    .map(k => doc[k])

  let findings = []
  findingsTables.forEach(tableRows => {
    findings = findings.concat(tableRows)
  })

  return findings
}

function processResolvedFindings(frm) {
  const doc = frm.doc

  const exclusionParentFields = ['exceptions', 'no_evidence'] // dont process findings in these tables

  const findings = getExistingFindings(frm)
  const resolvedFindings = findings.filter(
    r =>
      r.rcacapa_acceptance === 'Accepted' &&
      !exclusionParentFields.includes(r.parentfield)
  )

  resolvedFindings.forEach(r => (r.selection = 'Yes')) // selection set to yes in findings table row
  console.log(
    'findings closed table: ',
    getFormTable(frm, k_closedFindingsTableName)
  )
  console.log('resolved: ', resolvedFindings)

  const resolvedFindingsIds = resolvedFindings.map(r => r.row_id)
  changeChecklistTabRows(frm, resolvedFindingsIds)

  // names of tables from which at least one row has been accepted
  let rebuildFindingsTableNames = new Set(
    resolvedFindings.map(r => r.parentfield)
  )
  console.log('rebuild table: ', rebuildFindingsTableNames)

  // clearing the table and rebuilding it with all rows except the newly accepted rows
  rebuildFindingsTableNames.forEach(tableName => {
    const rows = doc[tableName].filter(
      r => !resolvedFindingsIds.includes(r.row_id)
    )
    frm.clear_table(tableName)
    rows.forEach(r => frm.add_child(tableName, r))
    frm.refresh_fields(tableName)
  })

  // putting resolved findings in closed findings table
  resolvedFindings.forEach(rowElement => {
    if (rowElement.finding_raised_date == undefined)
      console.log('ROW ELE: ', rowElement)

    const newEntry = frm.add_child(k_closedFindingsTableName)

    newEntry.row_id = rowElement.row_id

    newEntry.module = getModuleName(rowElement.parentfield)
    newEntry.practice = rowElement.practice
    newEntry.selection = rowElement.selection
    newEntry.severity = rowElement.severity
    newEntry.opportunity_description = rowElement.opportunity_description
    newEntry.gdp_clause = rowElement.gdp_clause
    newEntry.iso_clause = rowElement.iso_clause
    newEntry.finding_detail = rowElement.finding_detail
    newEntry.question = rowElement.question
    newEntry.rcacapa_acceptance = rowElement.rcacapa_acceptance
    newEntry.ageing = rowElement.ageing
  })
}

function getFormTable(frm, tableName) {
  const doc = frm.doc

  return doc[Object.keys(doc).find(k => k == tableName)]
}

/**
 * for each newly resolved findings row, this function sets the field:
 *
 * - 'selection' to 'Yes'
 *
 * - 'rcacapa_acceptance' to 'Acceptance'
 * @param {} frm form
 * @param {} rowIds ids of findings rows which are recently resolved
 */
function changeChecklistTabRows(frm, rowIds) {
  const checkListRows = getChecklistRows(frm)

  const changedRows = checkListRows.filter(r => rowIds.includes(r.row_id))

  changedRows.forEach(r => {
    r.selection = 'Yes'
    r.rcacapa_acceptance = 'Accepted'
  })

  console.log('changed rows: ', changedRows)
}

//------------------INIT STUFF-------------------------

const loadingStates = {}

const initConfigList = [
  {
    identifier: 'table',
    blacklistedFields: ['module'],
    args: {
      doctype: 'Opex Form Library',
      fields: [
        'practice',
        'module',
        'question',
        'opportunity_description',
        'gdp_clause',
        'iso_clause',
        'cms',
        'severity',
        'dfi',
        'maturity_level',
        'guidelines_direction',
        'artifact_description',
      ],
      order_by: 'practice',
    },
  },
  {
    identifier: 'artifact',
    blacklistedFields: ['module'],
    args: {
      doctype: 'Opex File Library',
      fields: [
        'practice',
        'module',
        'artifacts',
        'evidence_list_description',
        'primary_ownership',
      ],
      order_by: 'practice',
    },
  },
]

const checkAndSaveForm = frm => {
  const shouldSave = Object.values(loadingStates).every(v => !v)
  if (shouldSave) {
    frm.enable_save()
    frm.set_value('form_status', k_formStatuses.INITIATED)
    frm.set_value('initialized', 1)
    frm.refresh_fields()
    frm.trigger('calculate_data')
    // frm.save()
  }
}

/**
 * adds rows to tables as per this.config
 */
function onDataRecievedCB({ message: data }) {
  // console.log(data);
  if (data && data.length) {
    const childDataMap = {}
    data.forEach(row => {
      if (childDataMap[row.module]) childDataMap[row.module].push(row)
      else childDataMap[row.module] = [row]
    })
    // console.log('module map obj:', childDataMap);
    if (this.frm && this.tables) {
      console.log('Initiating Tables!', this.tables)
      const config = this.config
      if (config.blacklistedFields) {
        // let rowToAdd = {}
        this.tables.forEach(tableKey => {
          console.log('table name:', tableKey)
          const rows = childDataMap[tableKey]
          if (rows && rows.length)
            rows.forEach(row => {
              const rowToAdd = { ...row }
              config.blacklistedFields.forEach(rowKey => {
                delete rowToAdd[rowKey]
              })
              this.frm.add_child(tableKey, rowToAdd)
            })
          this.frm.refresh_field(tableKey)
        })
      }
    }
  }
  console.log('Initiating Completed!', this.config.identifier)
  loadingStates[this.config.identifier] = false
  checkAndSaveForm(this.frm)
}

/**
 * responsible for form setup of creation
 * @param {*} frm form
 */
function handleFormSetup(frm) {
  const tablesMap = {}
  const identifiers = initConfigList.map(c => c.identifier)
  // console.log(frm,frm.doc);
  if (frm && frm.doc) {
    Object.keys(frm.doc).forEach(k => {
      const temp = identifiers.find(id => k.includes(id))
      if (temp) {
        if (tablesMap[temp]) tablesMap[temp].push(k)
        else tablesMap[temp] = [k]
      }
    })
    initConfigList.forEach(config => {
      loadingStates[config.identifier] = true
      const bound = { frm, tables: tablesMap[config.identifier], config }
      frappe.call({
        method: 'frappe.client.get_list',
        args: config.args,
        callback: onDataRecievedCB.bind(bound),
      })
    })
    const today = frappe.datetime.get_today()
    frm.set_value('actual_start_date', today)
    frm.set_value('planned_end_date', frappe.datetime.add_days(today, 45))
    frm.set_value(
      'evidence_collection_end_date',
      frappe.datetime.add_days(today, 10)
    )
    frm.refresh_fields()
    removeUndesiredUI()
  }
}

// const populateFindingBank = frm => {
// 	const findings_table = []
// 	if (frm && frm.doc) {
// 		Object.keys(frm.doc).forEach(tableName => {
// 			if (tableName && tableName.includes('_table')) {
// 				const module = tableName.split('_table')[0]
// 				for (let row of frm.doc[tableName]) {
// 					if (row.selection === 'No') {
// 						const data = Object.assign({}, row)
// 						const ref_id = `${data.name}`
// 						delete data.idx
// 						delete data.__unsaved
// 						delete data.creation
// 						delete data.docstatus
// 						delete data.doctype
// 						delete data.modified
// 						delete data.modified_by
// 						delete data.name
// 						findings_table.push({
// 							ref_id,
// 							...data,
// 							module
// 						})
// 					}
// 				}
// 			}

// 		});
// 		// console.log(findings_table)
// 		frappe.call({
// 			method: 'frappe.client.insert',
// 			args: {
// 				doc: {
// 					doctype: 'Finding Bank',
// 					parent_table_ref: frm.doc.name,
// 					findings_table
// 				}
// 			},
// 			callback: data => {
// 				console.log('Insert success', data);
// 			},
// 		});
// 	}

// }

/**
 * sets score statistics on exit/review
 * @param {*} frm form
 */
const performExit = frm => {
  const fieldStr = isExit ? 'exit' : isReview ? 'review' : ''
  frm.set_value(
    `account_score_${fieldStr}_exception`,
    frm.doc.account_score_exception
  )
  frm.set_value(
    `account_score_${fieldStr}_wo_exception`,
    frm.doc.account_score_wo_exception
  )

  frm.doc.module_score.forEach(row => {
    row[`${fieldStr}_score_exception`] = row.score_exception
    row[`${fieldStr}_score_wo_exception`] = row.score_wo_exception
  })
  frm.doc.practice_score.forEach(row => {
    row[`${fieldStr}_score_exception`] = row.score_exception
    row[`${fieldStr}_score_wo_exception`] = row.score_wo_exception
    row[`${fieldStr}_maturity_level_exception`] = row.maturity_level_exception
    row[`${fieldStr}_maturity_level_wo_exception`] =
      row.maturity_level_wo_exception
  })
  Object.keys(frm.doc).forEach(tableName => {
    if (tableName.includes('_table'))
      frm.doc[tableName].forEach(row => {
        row[`${fieldStr}_selection`] = row.selection
      })
  })

  const docName = frm.doc.ref_planner
  // getPlannerDocName(frm)
  frappe.db.set_value(
    'OpEx Planner',
    docName,
    'status',
    isExit ? 'Exited' : isReview ? 'Reviewed' : ''
  )

  frm.refresh_fields()
  isExit = false
  isReview = false
}
const removeGridButtons = (frm, hasPerm) => {
  removeAttachPopupExtraBtns()

  // TODO: confirm whether code below a prev iteration of making fields read only
  if (frm.doc) {
    //Disable drag n drop
    //$('.sortable-handle').removeClass('sortable-handle')
    //Hide row check button
    //$('.row-check').remove()
    //Hide column setting button
    // $('.grid-static-col > a').parent().hide()

    $.find('.btn-open-row').forEach(g => {
      $(g).click(() => {
        $('.grid-footer-toolbar').hide()
        $('.row-actions').hide()
      })
    })
    Object.keys(frm.doc).forEach(k => {
      if (/table|artifact/g.test(k)) {
        const field = frm.get_field(k)
        // frm.set_df_property('remarks', 'read_only', 1, frm.docname, k)
        field.grid.grid_buttons.hide()
        if (k.includes('artifact')) {
          field.grid.docfields.forEach(f => {
            if (
              (hasPerm
                ? ['accepted_status', 'remarks']
                : ['attach_files', 'comments_as_per_account']
              ).includes(f.fieldname)
            )
              return
            f.read_only = 1
          })
        }
      }
    })
    /// WARNING: commenting below cuts 2-3 secs on initial load
    /// Don't know what it does, maybe important
    // frm.refresh_fields()
  }
}

const onFormRefresh = frm => {
  // console.log('Refresh', frm)


frm.set_intro('In accordance with various data protection regulations, DO NOT upload any client sensitive information, like, PII, PHI, etc., on OpEx portal while sharing the evidences. Violation to the same may result in non-compliance & disciplinary action.', 'red');
  removeUndesiredUI()
  const timestamp = new Date().getTime()

  // console.log(frm)
  // frm.set_df_property(
  //   'accepted_status',
  //   'read_only',
  //   1,
  //   frm.docname,
  //   'capacity_artifacts',
  //   'accepted_status'
  // )
  // const isAllowed = frm.perm && frm.perm.some(p => p.permlevel === 1)

  // TODO: confirm whether code below a prev iteration of making fields read only
  const isAllowed = !frappe.user_roles.includes('Ops')
  frm.toggle_enable(
    ['evidence_collection_end_date', 'lead_appraiser'],
    isAllowed
  )

  removeGridButtons(frm, isAllowed)
  if (!isAllowed) {
    frm.page.sidebar.hide()
    return
  }
  if (!frm.is_new()) {
    if (!frm.doc.initialized)
      frm.add_custom_button(
        'Initiate',
        () => {
          frm.disable_save()
          frm.remove_custom_button('Initiate', 'Actions')
          frm.trigger('refresh_process')
          frm.trigger('initiate_data')
          frm.trigger('initiate_opex_planner')
        },
        'Actions'
      )
    else {
      // frm.add_custom_button('Refresh Ageing', () => {
      // 	frm.trigger('calculate_ageing')
      // })
      if (!frm.doc.exited)
        frm.add_custom_button('Publish Exit', () => {
          frappe.confirm('Are you sure you want to Exit?', () => {
            isExit = true
            frm.trigger('calculate_data')
            frm.set_value('form_status', k_formStatuses.EXITED)
            frm.set_value('exit_report_date', frappe.datetime.get_today())
            frm.set_value('exited', 1)
            frm.remove_custom_button('Exit')
            frm.save()
          })
        })
      if (frm.doc.exited)
        frm.add_custom_button('Publish Review', () => {
          frappe.confirm('Are you sure you want to Review?', () => {
            isReview = true
            frm.trigger('calculate_data')
            frm.set_value('form_status', k_formStatuses.REVIEWED)
            frm.set_value('review_report_date', frappe.datetime.get_today())
            frm.set_value('reviewed', 1)
            // frm.remove_custom_button('Review')
            frm.save()
          })
        })
      frm.add_custom_button('Refresh Process Details', () => {
        frm.trigger('refresh_process')
      })
      frm.add_custom_button('Refresh Score', () => {
        frappe.confirm('Proceed to calculate scores?', () => {
          frm.trigger('calculate_data')
        })
      })
    }
  }

  console.log('Refresh in ', new Date().getTime() - timestamp, ' ms')
}

/**
 * @param {} frm form
 * @param {bool} shouldSaveAfter if true (default) then frm.save() is called by this function
 */
function calculateAgeingForExistingFindings(frm, shouldSaveAfter = true) {
  const findings = getExistingFindings(frm)
  console.log('calculating ageing')
  frm.set_value('current_date', new Date())

  findings.forEach(
    finding =>
      (finding.ageing =
        finding.finding_raised_date == undefined
          ? '-'
          : Math.floor(
              (new Date().getTime() -
                new Date(finding.finding_raised_date).getTime()) /
                86400000
            ) + ' days')
  )

  frm.refresh_fields()
  if (shouldSaveAfter) {
    frm.save() // some error does not allow an infinite loop. idk why, but it works
  }
}

/**
 * refreshes direct single valued fields in the form
 * @param {} frm form
 */
const refreshProcessDetails = frm => {
  const name = frm.doc.bcsla_code
  // console.log('bcsla code: ', name)
  frappe.call({
    method: 'frappe.client.get',
    args: {
      doctype: 'Oracle Master',
      name,
    },
    callback: data => {
      const values = data.message
      console.log('values: ', values)
      if (values) {
        Object.keys(values).forEach(k => {
          if (values[k] && !k_ignoredFields.includes(k))
            frm.set_value(k, values[k])
        })
        frm.refresh_fields()
      }
    },
  })
}

/**
 * Removes add row buttons from all tables of a tab
 * @param {} tabCssIds CSS IDs of tabs to remove add row buttons from
 */
function removeAddRowBtnsFromTabs(tabCssIds) {
  for (let i = 0; i < tabCssIds.length; i++) {
    let tab = document.getElementById(tabCssIds[i])
    // console.log('TAB', tab)
    let formGroups = tab.querySelectorAll('.frappe-control.form-group')
    // console.log(formGroups.length)
    // console.log('GROUPS', formGroups)
    for (let j = 0; j < formGroups.length; j++) {
      const n = formGroups[j].children.length
      const gridField = formGroups[j].children[n - 1]
      const gridFooter = gridField.getElementsByClassName('grid-footer')[0]
      if (gridFooter != undefined) {
        gridFooter.remove()
      }
      // console.log('DELETE THIS', formGroups[j].children[n - 1])
      // if (gridField.classList.contains('grid-footer')) {
      //   gridField.remove()
      // }
    }
  }
}

/**
 * Initialises event listeners required for UI cleanup on various events
 */
function initUiCleanupListeners(frm) {
  window.addEventListener('click', function () {
    if (isUiCleanupRequired) {
      // console.log('click cleanup')
      removeUndesiredUI()
      addXssHandlingEventListeners()
      addFileUploadRestrictEventListeners()
      addWorkmodeEventListeners(frm)
      
      isUiCleanupRequired = false
    }
  })

  let pageChangeBtns = document.querySelectorAll(
    '.first-page, .prev-page, .next-page, .last-page'
  )
  // console.log(pageChangeBtns.length)
  // console.log(pageChangeBtns)
  for (let i = 0; i < pageChangeBtns.length; i++) {
    pageChangeBtns[i].addEventListener('click', function () {
      // console.log('page change cleanup')
      removeUndesiredUI()
    })
  }

  let attachColumns = document.querySelectorAll(
    '[data-fieldname="attach_files"]'
  )
  for (let i = 0; i < attachColumns.length; i++) {
    attachColumns[i].addEventListener('click', () => {
      // setTimeout(() => {
      // }, 0)
      attachmentClearButtonRemover(attachColumns[i])
    })
  }
  // console.log('evnet listsjgls')
  addXssHandlingEventListeners()
  addFileUploadRestrictEventListeners()
  addWorkmodeEventListeners(frm)

}


function addXssHandlingEventListeners() { // TODO: ReEnable this
  let assignButtons = document.getElementsByClassName('add-assignment-btn')
  // console.log(assignButtons.length, assignButtons)
  for (let i = 0; i < assignButtons.length; i++) {
    assignButtons[i].addEventListener('click', () => {
      setTimeout(() => {
        handlePopupXSS()
      }, 200)
  
    })
  }

  addMainCommentFieldsXssHandlingListeners()
  addCommentEditingXssHandlingListeners()
  addInputFieldXssHandlingEventListeners()
  addTextAreaXssHandlingEventListeners()
}

function addMainCommentFieldsXssHandlingListeners() {
  let mainCommentFields = document.querySelectorAll('div[data-fieldname="comment"]')
  if (mainCommentFields == undefined) return

  mainCommentFields.forEach((commentField) => {
    commentField.addEventListener('beforeinput', (event) => disableInputByRegex(event, k_XssDisablingRegex))
  })
}

function addCommentEditingXssHandlingListeners() {
  let commentSection = document.getElementsByClassName('comment-box')
  if (commentSection == undefined) return
  commentSection = commentSection[0]

  let commentBtn = commentSection.getElementsByClassName('btn-comment')
  if (commentBtn == undefined) return
  commentBtn = commentBtn[0]

  commentBtn.addEventListener('click', () => {
    setTimeout(() => addMainCommentFieldsXssHandlingListeners(), 500)
  })
}

function addInputFieldXssHandlingEventListeners() {
  let inputFields = document.getElementsByTagName('input')
  if (inputFields == undefined) return
  
  Array.from(inputFields).forEach((inputField) => {
    inputField.addEventListener('beforeinput', (event) => disableInputByRegex(event, k_XssDisablingRegex))
  })
}

function addTextAreaXssHandlingEventListeners() {
  let textAreas = document.getElementsByTagName('textarea')
  if (textAreas == undefined) return

  Array.from(textAreas).forEach((textArea) => {
    textArea.addEventListener('beforeinput', (event) => disableInputByRegex(event, k_XssDisablingRegex))
  })
}

function handlePopupXSS() {

  // console.log('handling xss')
  let popupList = document.getElementsByClassName('modal-dialog')
  if (popupList == undefined) return

  let popup = popupList[popupList.length - 1]
  if (popup == undefined) return
  console.log(popup)

  let assignToTextField = popup.querySelector('input[data-fieldname="assign_to"]')
  if (assignToTextField == undefined) return
  console.log(assignToTextField)
  assignToTextField.addEventListener('beforeinput', (event) => disableInputByRegex(event, k_XssDisablingRegex));


  let commentTextField = popup.querySelector('textarea[data-fieldname="description"]')
  if (commentTextField == undefined) return
  console.log(commentTextField)
  commentTextField.addEventListener('beforeinput', (event) => disableInputByRegex(event, k_XssDisablingRegex));

}

function disableInputByRegex(event, regex) {
  if (event.data != null && regex.test(event.data)) 
      event.preventDefault();
}

function removeAttachPopupExtraBtns() {
  const attachBtns = getAllAttachBtns()
  attachBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        setTimeout(() => {
          let popupList = document.getElementsByClassName('modal-dialog')
          if (popupList == undefined) return
  
          let popup = popupList[popupList.length - 1]
          if (popup == undefined) return
  
          let uploadArea = popup.getElementsByClassName('file-upload-area')[0]
          if (uploadArea == undefined) return
  
          let btnContainer = uploadArea.getElementsByClassName(
            'btn btn-file-upload'
          )[0].parentElement
          if (btnContainer == undefined) return
  
          while (btnContainer.children.length > 1) {
            btnContainer.children[1].remove()
          }
        }, 200)
      })
    })
}

function getAllAttachBtns() {
  let btns = Array.from(document.getElementsByClassName('add-attachment-btn'))
  let formBtns = Array.from(document.querySelectorAll('button[data-fieldtype="Attach"]'))
  // console.log('side btns:', btns)
  // console.log('form btns:', formBtns)

  return btns.concat(formBtns)
  // btns = btns.concat(Array.from(document.querySelectorAll('[data-fieldtype="Attach"]')))

  // const s = new Set(btns)
  // return Array.from(s);
}

function addFileUploadRestrictEventListeners(allowedExtensions = ['.png', '.jpg'], alwaysDissallow = ['.exe', '.php']) {
  // const attachBtns = getAllAttachBtns()
  // attachBtns.forEach(btn => {
  //   btn.addEventListener('click', () => {
  //     setTimeout(() => {
  //       let popupList = document.getElementsByClassName('modal-dialog')
  //       if (popupList == undefined) return

  //       let popup = popupList[popupList.length - 1]
  //       if (popup == undefined) return

  //       let uploadBtns = popup.getElementsByClassName('btn-primary')
  //       console.log(uploadBtns)
  //       if (uploadBtns == undefined) return

  //       let filePreviews = popup.getElementsByClassName('file-preview-area')
  //       console.log('previews:', filePreviews)
  //       if (filePreviews == undefined) return

  //       let observer = new MutationObserver(function(mutations) {
  //         mutations.forEach(function(mutationRecord) {
  //           let fileNames = Array.from(document.getElementsByClassName('file-name')).map((e) => e.innerHTML)

  //           console.log('fileNames:')
  //           console.log(fileNames)
  //           if (fileNames == undefined) return

  //           let uploadAllowed = true

  //           fileNames.forEach((fileName) => {
  //             alwaysDissallow.forEach((extension) => {
  //               if (fileName.includes(extension)) {
  //                 uploadAllowed = false
  //               }
  //             })
  //             if (fileName.length < 4 || !allowedExtensions.includes(fileName.slice(fileName.length - 4, fileName.length))) {
  //               uploadAllowed = false
  //             }
  //           })

  //           if (!uploadAllowed) {
  //             popup.parentElement.click()

  //             frappe.throw('Only ' + allowedExtensions.join(', ') + ' files are allowed!')
  //             // event.preventDefault()
  //             return
  //           }
  //         })
  //       })
        
  //       Array.from(filePreviews).forEach((element) => {
  //         observer.observe(element, { 
  //           attributes: true, 
  //           attributeFilter: ['style'] 
  //         });
  //       })
        
        

  //       // console.log('BTN:', uploadBtns[0])


  //       // Array.from(uploadBtns).forEach(uploadBtn => {
  //       //   uploadBtn.addEventListener('click', (event) => {
  //       //     let fileNames = Array.from(document.getElementsByClassName('file-name')).map((e) => e.innerHTML)
  //       //     console.log('fileNames:')
  //       //     console.log(fileNames)
  //       //     if (fileNames == undefined) return

  //       //     let uploadAllowed = true
  //       //     fileNames.forEach((fileName) => {
  //       //       if (fileName.length < 4 || !allowedExtensions.includes(fileName.slice(fileName.length - 4, fileName.length))) {
  //       //         uploadAllowed = false
  //       //       }
  //       //     })

  //       //     if (!uploadAllowed) {
  //       //       frappe.throw('Only ' + allowedExtensions.join(', ') + ' files are allowed!')
  //       //       event.preventDefault()
  //       //       return
  //       //     }
  //       //   })
  //       // })
        

  //     }, 200)
  //   })
  // })
}

const removeUndesiredUI = () => {
  // console.log('removing UI')
  let checkboxes = document.getElementsByClassName('row-check')
  let serialNumberElements = document.getElementsByClassName('row-index')

  removeConfigureColumnsButtons()
  // console.log('check')
  removeHtmlElements(checkboxes)
  // console.log('serial')
  removeHtmlElements(serialNumberElements)
  removeAddRowBtnsFromTabs(['opex4-findings_tab', 'opex4-best_practices_tab'])
  removeAttachPopupExtraBtns()
  attachmentClearButtonRemover(document)
}

/**
 * Removes `elements` from the DOM tree
 * @param {*} elements Array like object of HTMLElement's
 */
async function removeHtmlElements(elements) {
  // don't use a traditional loop for removing, its about 20x slower
  Array.from(elements).forEach(elem => elem.remove())
}

function removeConfigureColumnsButtons() {
  let configureColumnsIcons = document.querySelectorAll(
    '[href="#icon-setting-gear"]'
  )

  for (let i = 0; i < configureColumnsIcons.length; i++) {
    let row =
      configureColumnsIcons[i].parentElement.parentElement.parentElement
        .parentElement
    configureColumnsIcons[i].parentElement.parentElement.parentElement.remove()

    let newElement = document.createElement('div')
    newElement.className =
      'col grid-static-col col-xs-1 d-flex justify-content-center'
    row.appendChild(newElement)
  }
}

const initiatePlanner = frm => {
  const docName = frm.doc.ref_planner
  // getPlannerDocName(frm)
  frappe.db.set_value('OpEx Planner', docName, 'status', 'Initiated')
  // console.log('Hello Planner--->', d, frappe);
}

/**
 *
 * @param {Array<String>} rolesNotAllowed user roles which are not authorized
 * @param {Array<String>} rolesAlwaysAllowed user roles which are always allowed (e.g. say admin)
 * @returns {bool}
 */
function isUserAuthorized(rolesNotAllowed, rolesAlwaysAllowed) {
  for (let i = 0; i < rolesAlwaysAllowed.length; i++) {
    let role = rolesAlwaysAllowed[i]
    if (frappe.user_roles.includes(role)) return true
  }

  // console.log(frappe.user_roles)
  let isAllowed = true
  for (let j = 0; j < rolesNotAllowed.length && isAllowed; j++) {
    let role = rolesNotAllowed[j]
    isAllowed = !frappe.user_roles.includes(role)
  }

  return isAllowed
}

/**
 * disables input fields in tables on the page
 * @param {Array<String>} fieldNames fields names of fields to disable
 * @param {Array<String>} rolesToDisableFor user roles to disable the fields for
 * @param {Array<String>} forceEnableRoles user roles to always enable the fields for
 * @returns {void}
 */
function pageInputFieldDisabler(
  fieldNames,
  rolesToDisableFor,
  forceEnableRoles = ['Administrator', 'Appraiser', 'BU/HU Lead']
) {
  let isAllowed = isUserAuthorized(rolesToDisableFor, forceEnableRoles)

  if (isAllowed) return

  for (let i = 0; i < fieldNames.length; i++) {
    let candidateFields = document.querySelectorAll(
      '[data-fieldname="' + fieldNames[i] + '"]'
    )

    for (let j = 0; j < candidateFields.length; j++) {
      let fieldElement = candidateFields[j]

      if (fieldElement.className.includes('col grid-static-col')) {
        // field is chosen
        // console.log('CHOSEN FIELD', fieldElement)

        // cloning removes all event listeners
        // frappe makes field editable through event listeners
        let fieldElementClone = fieldElement.cloneNode()
        fieldElementClone.innerHTML = fieldElement.innerHTML
        fieldElement.parentElement.replaceChild(fieldElementClone, fieldElement)
      }
    }
  }
}

/**
 * disables input fields in popup table editors
 * @param {Array<String>} fieldNames fields names of fields to disable
 * @param {Array<String>} rolesToDisableFor user roles to disable the fields for
 * @param {Array<String>} forceEnableRoles user roles to always enable the fields for
 * @returns {void}
 */
function popupTableInputFieldDisabler(
  fieldNames,
  rolesToDisableFor,
  forceEnableRoles = ['Administrator', 'Appraiser', 'BU/HU Lead']
) {
  let isAllowed = isUserAuthorized(rolesToDisableFor, forceEnableRoles)

  if (isAllowed) return

  for (let i = 0; i < fieldNames.length; i++) {
    let field = fieldNames[i]
    // console.log('FIELD: ', field)

    let popupForm = document.getElementsByClassName('grid-row grid-row-open')[0]
    // console.log(
    //   'POPUP FORMS',
    //   document.getElementsByClassName('grid-row grid-row-open')
    // )

    // console.log(
    //   'Candidate fields: ',
    //   popupForm.querySelectorAll('[data-fieldname="' + field + '"]')
    // )

    let candidateDataFields = popupForm.querySelectorAll(
      '[data-fieldname="' + field + '"]'
    )

    for (let j = 0; j < candidateDataFields.length; j++) {
      if (candidateDataFields[j].className.includes('frappe-control')) {
        let dataField = candidateDataFields[j]
        // console.log('CHOSEN FIELD', dataField)

        if (dataField == undefined) continue

        // console.log(
        //   'wraper:',
        //   dataField.getElementsByClassName('control-input-wrapper')
        // )

        let wrapper = dataField.getElementsByClassName(
          'control-input-wrapper'
        )[0]
        if (wrapper == undefined) {
          // console.log('undefined')
          continue
        }

        let disableThis = wrapper.querySelector('.control-input')
        let enableThis = wrapper.querySelector('.like-disabled-input')

        // console.log('disable', disableThis)
        // console.log('enable', enableThis)

        disableThis.style.display = 'none'
        enableThis.style = ''

        if (enableThis.innerHTML == 'undefined') {
          enableThis.innerHTML = ''
        }
      }
    }
  }
}

/**
 * Removed clear attachment buttons in `element` if current user role in `removeForRoles`
 * @param {HTMLElement} element element withing which clear buttons should be removed
 * @param {Array<String>} removeForRoles user roles for which clear buttons should be removed
 * @returns {void}
 */
function attachmentClearButtonRemover(element, removeForRoles = ['BU/HU Lead', 'Appraiser']) {
  console.log('CLEAR BTN??')
  let shouldDisable = false

  for (let i = 0; i < removeForRoles.length; i++) {
    shouldDisable = frappe.user_roles.includes(removeForRoles[i])
  }

  // console.log(shouldDisable)
  if (!shouldDisable) return

  let clearBtns = element.querySelectorAll('[data-action="clear_attachment"]')
  // console.log(clearBtns)
  if (clearBtns == undefined || clearBtns.length < 1) return

  for (let i = 0; i < clearBtns.length; i++) {
    clearBtns[i].remove()
  }
}

function enableWorkmode(frm) {
  if (frm.doc.working_user == undefined) {
    frm.doc.working_user = frappe.user.name
    frm.doc.work_start_time = frappe.datetime.now_datetime()
    frm.doc.check_9 = 1
    frm.save()
    frappe.show_alert({
      message:__('Work mode started for user ' + frappe.user.name + '.'),
      indicator:'green'
    }, 7);
  }

}

function disableWorkmode(frm) {
    frm.doc.working_user = undefined
    frm.doc.work_start_time = undefined
    frm.doc.check_9 = 0
    frm.save()
    frappe.show_alert({
      message:__('Work mode disabled.'),
      indicator:'green'
    }, 7);
}

function addWorkmodeEventListeners(frm) {
  
  let enableBtn = document.querySelectorAll(
    'button[data-fieldname="enable_workmode"]'
  )[0]

  let disableBtn = document.querySelectorAll(
    'button[data-fieldname="disable_workmode"]'
  )[0]

  enableBtn.addEventListener('click', (event) => {
    enableWorkmode(frm)
  })

  disableBtn.addEventListener('click', (event) => {
    disableWorkmode(frm)
  })

}

function handleInitialWorkmodePopup(frm) {
  console.log('in fucntion:', frm.doc.working_user)
  let isWorkmodeDisabled = false
  if (frm.doc.working_user != undefined) {
    console.log('in undefined if')
    let minutesSinceWorkStart = Math.floor(
      (new Date().getTime() -
        new Date(frm.doc.work_start_time).getTime()) /
        60000
    )
    console.log('ms elasped: ', (new Date().getTime() -
    new Date(frm.doc.work_start_time).getTime()))
    console.log("minutes since start: ", minutesSinceWorkStart)
    if (minutesSinceWorkStart >= 30) {
      disableWorkmode(frm)
      isWorkmodeDisabled = true
    }

    if (!isWorkmodeDisabled) {
      frappe.msgprint('Work mode enabled ' + minutesSinceWorkStart + ' minutes ago by ' + frm.doc.working_user + '.')
    }
  }
}

frappe.ui.form.on('OpEx4', {
  before_save: frm => {
    processResolvedFindings(frm)
    calculateAgeingForExistingFindings(frm, false)

    shouldCalculateScore = true
    frm.trigger('calculate_data')
  },
  // before_submit: populateFindingBank,
  before_load: frm => {},
  calculate_data: startAnalyzing,
  refresh: frm => {
    onFormRefresh(frm)
  },
  initiate_data: handleFormSetup,
  perform_exit: performExit,
  refresh_process: refreshProcessDetails,
  initiate_opex_planner: initiatePlanner,
  // form_render: disablemainfrm
  onload_post_render: frm => {
    console.log('console.log really working')
    console.log('DOC:', frm.doc)
    // const keys = Object.keys(frm.doc)
    // console.log('RAW KEYS:', keys)
    // const toPrint = []
    // for (let  i = 0; i < keys.length; i++) {

    //   toPrint.push('doc.' + keys[i])
    // }
    // console.log(toPrint.join(', '))
    pageInputFieldDisabler(
      [
        'rcacapa_acceptance',
        'description',
        'selection',
        'severity',
        'accepted_status_opex',
        'remarks_opex',
        'finding_detail',
      ],
      ['Ops']
    )

    removeUndesiredUI()
    if (!isUiCleanupListenersInitDone) {
      initUiCleanupListeners(frm)
      isUiCleanupListenersInitDone = true
    }

    frappe.realtime.on("show_popup", (data) => {
			console.log('popup data:', data)
		})

    console.log('USER:', frappe.user)
    handleInitialWorkmodePopup(frm)

    
    // for generating ids for existing rows
    // console.log('frm: ', frm)
    // const doc = frm.doc
    // console.log('doc: ', doc)
    // let cntr = 0
    // Object.keys(doc).forEach(k => {
    //   if (k.includes('_table') && !k.includes('artifact')) {
    //     const rows = doc[k]
    //     for (let i = 0; i < rows.length; i++) {
    //       rows[i].row_id = cntr
    //       cntr++
    //     }
    //   }
    // })
    // console.log('cntr: ', cntr)
  },
  after_save: frm => {
    isUiCleanupRequired = true
  },
})

frappe.ui.form.on('Opex appraisal file bank items', {
  form_render(frm, cdt, cdn) {
    popupTableInputFieldDisabler(
      ['accepted_status_opex', 'remarks_opex', 'finding_detail'],
      ['Ops']
    )
    removeAttachPopupExtraBtns()
    attachmentClearButtonRemover(document)
    addFileUploadRestrictEventListeners()
    addXssHandlingEventListeners()
  },
})

frappe.ui.form.on('Opex Appraisal Form Child Table', {
  form_render(frm, cdt, cdn) {
    removeAttachPopupExtraBtns()
    attachmentClearButtonRemover(document)
    addFileUploadRestrictEventListeners()
    addXssHandlingEventListeners()
  },
})

frappe.ui.form.on('finding child table form', {
  form_render(frm, cdt, cdn) {
    console.log('run')
    popupTableInputFieldDisabler(
      [
        'rcacapa_acceptance',
        'closure_description',
        'selection',
        'severity',
        'finding_detail',
        'opportunity_description',
      ],
      // ['rcacapa_acceptance', 'description'],
      // ['selection'],
      ['Ops']
    )
    //console.log('running')
    removeAttachPopupExtraBtns()
    attachmentClearButtonRemover(document)
    addFileUploadRestrictEventListeners()
    addXssHandlingEventListeners()
  },
})
