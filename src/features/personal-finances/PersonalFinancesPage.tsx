// =============================================================================
// PERSONAL FINANCES PAGE — Main Page Component
// =============================================================================

import { useMemo, useState } from 'react'
import { Plus, Wallet, TrendingDown, ShoppingBag, CreditCard } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import type { PFCardConsumption, PFFixedExpense, PFIncome } from '@/db/schema'
import { usePersonalFinancesV3 } from './hooks/usePersonalFinancesV3' // V3 Hook
import type { CardStatementData } from './hooks/usePersonalFinancesV3'
import { formatARS } from './models/calculations' // Keep for formatting helper
import { useComputedPortfolio } from '@/hooks/use-computed-portfolio'
import { getTodayISO } from './utils/dateHelpers'
import {
    getFixedExpenseScheduledDate,
    getIncomeScheduledDate,
} from './models/financeHelpers'
import {
    KPICard,
    MonthPicker,
    OverviewTab,
    DebtsTab,
    FixedExpensesTab,
    IncomeTab,
    BudgetTab,
    FinancesModal,
    FinanceExecutionModal,
    CreditCardsSection,
    CardManageModal,
    CardConsumptionModal,
    ImportStatementModal,
} from './components'
import { createMovementFromFinanceExecution } from './services/movementBridge'
import type { PFDebt, FixedExpense, Income, BudgetCategory, NewItemType } from './models/types'
import type { PFCreditCard } from '@/db/schema' // V3 types

type TabType = 'overview' | 'debts' | 'expenses' | 'income' | 'budget'
type ModalType = 'debt' | 'expense' | 'income' | 'budget' | 'expense-normal'
type ViewMode = 'plan' | 'actual'

type ExecutionTarget =
    | { kind: 'income'; income: PFIncome }
    | { kind: 'expense'; expense: PFFixedExpense }
    | { kind: 'card_statement'; data: CardStatementData }

export function PersonalFinancesPage() {
    // V3 Hook
    const pf = usePersonalFinancesV3()
    const { data: portfolioTotals } = useComputedPortfolio()
    const trackCashEnabled = useMemo(
        () => localStorage.getItem('argfolio.trackCash') === 'true',
        []
    )

    // UI State
    const [activeTab, setActiveTab] = useState<TabType>('overview')
    const [viewMode, setViewMode] = useState<ViewMode>('plan')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [preselectedType, setPreselectedType] = useState<NewItemType | undefined>(undefined)
    const [editItem, setEditItem] = useState<PFDebt | FixedExpense | Income | BudgetCategory | null>(null)
    const [editType, setEditType] = useState<ModalType | undefined>(undefined)
    const [executionTarget, setExecutionTarget] = useState<ExecutionTarget | null>(null)

    // Credit Card Modals
    const [isCardManageOpen, setIsCardManageOpen] = useState(false)
    const [consumptionCard, setConsumptionCard] = useState<PFCreditCard | null>(null)
    const [editingConsumption, setEditingConsumption] = useState<PFCardConsumption | null>(null)
    const [editingCard, setEditingCard] = useState<PFCreditCard | null>(null)
    const [importCard, setImportCard] = useState<PFCreditCard | null>(null)
    const { toast } = useToast()
    const consumptionModalCard = editingCard ?? consumptionCard
    const importConsumptions = importCard
        ? [...pf.consumptionsClosing, ...pf.consumptions].filter(c => c.cardId === importCard.id)
        : []

    // Handlers
    const openNewModal = (preselect?: NewItemType) => {
        setEditItem(null)
        setEditType(undefined)
        setPreselectedType(preselect)
        setIsModalOpen(true)
    }

    const openEditModal = (item: PFDebt | FixedExpense | Income | BudgetCategory, type: ModalType) => {
        setEditItem(item)
        setEditType(type)
        setPreselectedType(undefined)
        setIsModalOpen(true)
    }

    const handleSave = async (data: any, type: ModalType) => {
        if (editItem) {
            // Update
            if (type === 'debt') await pf.updateDebt(editItem.id, data)
            else if (type === 'expense') await pf.updateFixedExpense(editItem.id, data)
            else if (type === 'income') await pf.updateIncome(editItem.id, data)
            else if (type === 'budget') await pf.updateBudget(editItem.id, data)
        } else {
            // Create
            if (type === 'debt') {
                await pf.createDebt({ ...data, remainingAmount: data.totalAmount })
            } else if (type === 'expense') {
                await pf.createFixedExpense(data)
            } else if (type === 'income') {
                await pf.createIncome({ ...data, yearMonth: pf.yearMonth })
            } else if (type === 'budget') {
                await pf.createBudget({ ...data, yearMonth: pf.yearMonth })
            }
        }
        setIsModalOpen(false)
        pf.refreshAll()
    }

    const handleDelete = async (id: string, type: ModalType) => {
        if (type === 'debt') await pf.deleteDebt(id)
        else if (type === 'expense') await pf.deleteFixedExpense(id)
        else if (type === 'income') await pf.deleteIncome(id)
        else if (type === 'budget') await pf.deleteBudget(id)

        setIsModalOpen(false)
        pf.refreshAll()
    }

    const executionDefaults = useMemo(() => {
        if (!executionTarget) return null
        if (executionTarget.kind === 'income') {
            return {
                title: executionTarget.income.title,
                subtitle: 'Ingreso planificado',
                amount: executionTarget.income.amount,
                dateISO: getIncomeScheduledDate(executionTarget.income),
                accountId: executionTarget.income.defaultAccountId || executionTarget.income.accountId,
            }
        }
        if (executionTarget.kind === 'expense') {
            return {
                title: executionTarget.expense.title,
                subtitle: 'Gasto fijo del mes',
                amount: executionTarget.expense.amount,
                dateISO: getFixedExpenseScheduledDate(executionTarget.expense, pf.yearMonth),
                accountId: executionTarget.expense.defaultAccountId,
            }
        }
        return {
            title: executionTarget.data.card.name,
            subtitle: `Vence ${executionTarget.data.dueStatement.dueDate}`,
            amount: executionTarget.data.dueTotal,
            dateISO: executionTarget.data.dueStatement.dueDate || getTodayISO(),
            accountId: executionTarget.data.card.defaultAccountId,
        }
    }, [executionTarget, pf.yearMonth])

    const handleExecutionConfirm = async (payload: {
        amount: number
        dateISO: string
        accountId?: string
        createMovement: boolean
    }) => {
        if (!executionTarget) return

        try {
            let movementId: string | undefined
            if (payload.createMovement) {
                if (!payload.accountId) return
                movementId = await createMovementFromFinanceExecution({
                    kind:
                        executionTarget.kind === 'income'
                            ? 'income'
                            : executionTarget.kind === 'card_statement'
                                ? 'credit_card_statement'
                                : 'expense',
                    accountId: payload.accountId,
                    date: payload.dateISO,
                    amount: payload.amount,
                    currency: 'ARS',
                    title:
                        executionTarget.kind === 'income'
                            ? executionTarget.income.title
                            : executionTarget.kind === 'expense'
                                ? executionTarget.expense.title
                                : executionTarget.data.card.name,
                    link: executionTarget.kind === 'card_statement'
                        ? { kind: 'card', id: executionTarget.data.card.id }
                        : executionTarget.kind === 'income'
                            ? { kind: 'income', id: executionTarget.income.id }
                            : { kind: 'expense', id: executionTarget.expense.id },
                })
            }

            if (executionTarget.kind === 'income') {
                await pf.executeIncome(executionTarget.income.id, {
                    effectiveDate: payload.dateISO,
                    accountId: payload.accountId,
                    movementId,
                })
            } else if (executionTarget.kind === 'expense') {
                await pf.executeFixedExpense(executionTarget.expense.id, {
                    yearMonth: pf.yearMonth,
                    effectiveDate: payload.dateISO,
                    amount: payload.amount,
                    accountId: payload.accountId,
                    movementId,
                })
            } else {
                await pf.markStatementPaid(
                    executionTarget.data.card.id,
                    payload.dateISO,
                    movementId,
                    payload.accountId,
                    payload.amount
                )
            }

            setExecutionTarget(null)
            pf.refreshAll()
        } catch (error) {
            console.error('Failed to execute finance item:', error)
        }
    }

    // Helper to convert string YYYY-MM to Date object
    const currentDate = new Date(pf.yearMonth + '-02T12:00:00')
    const liquidityValue = trackCashEnabled
        ? formatARS(portfolioTotals?.liquidityARS ?? 0)
        : 'Modo simple'
    const liquiditySubValue = trackCashEnabled
        ? undefined
        : 'Activa el tracking de cash en Ajustes'

    if (pf.loading) {
        return <div className="p-8 text-center text-slate-500 animate-pulse">Cargando Finanzas...</div>
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-display font-bold text-white">Finanzas Personales</h1>
                    <p className="text-slate-400">Control de ingresos, gastos y tarjetas</p>
                </div>
                <div className="flex items-center gap-3">
                    <MonthPicker
                        currentDate={currentDate}
                        onPrevious={pf.goToPrevMonth}
                        onNext={pf.goToNextMonth}
                    />
                    <button
                        onClick={() => openNewModal()}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center transition shadow-lg shadow-indigo-500/20"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Nuevo
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <KPICard
                    title="Ingresos estimados"
                    value={formatARS(pf.kpis.incomesEstimated)}
                    icon={Wallet}
                    type="success"
                    subValue={`Cobrados: ${formatARS(pf.kpis.incomesCollected)}`}
                />
                <KPICard
                    title="Gastos estimados"
                    value={formatARS(pf.kpis.expensesEstimated)}
                    icon={TrendingDown}
                    type="danger"
                    subValue={`Pagados: ${formatARS(pf.kpis.expensesPaid)}`}
                />
                <KPICard
                    title="Tarjetas devengado"
                    value={formatARS(pf.kpis.cardsAccrued)}
                    icon={CreditCard}
                    type="primary"
                />
                <KPICard
                    title="Tarjetas a pagar prox."
                    value={formatARS(pf.kpis.cardsDueNextMonth)}
                    icon={CreditCard}
                    type="neutral"
                />
                <KPICard
                    title="Tarjetas pagadas"
                    value={formatARS(pf.kpis.cardsPaid)}
                    icon={CreditCard}
                    type="success"
                />
                <KPICard
                    title="Liquidez disponible"
                    value={liquidityValue}
                    icon={ShoppingBag}
                    type="primary"
                    subValue={liquiditySubValue}
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <KPICard
                    title="Ahorro estimado del mes"
                    value={formatARS(pf.kpis.savingsEstimated)}
                    icon={Wallet}
                    type={pf.kpis.savingsEstimated >= 0 ? 'success' : 'danger'}
                />
                <KPICard
                    title="Ahorro real del mes"
                    value={formatARS(pf.kpis.savingsActual)}
                    icon={Wallet}
                    type={pf.kpis.savingsActual >= 0 ? 'success' : 'danger'}
                />
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={() => setViewMode('plan')}
                    className={`px-4 py-2 rounded-full text-sm border transition ${
                        viewMode === 'plan'
                            ? 'bg-indigo-500 text-white border-indigo-500'
                            : 'bg-transparent border-white/10 text-slate-400 hover:text-slate-200'
                    }`}
                >
                    Plan (Estimado)
                </button>
                <button
                    onClick={() => setViewMode('actual')}
                    className={`px-4 py-2 rounded-full text-sm border transition ${
                        viewMode === 'actual'
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-transparent border-white/10 text-slate-400 hover:text-slate-200'
                    }`}
                >
                    Efectivo (Real)
                </button>
            </div>

            {/* Tabs Navigation */}
            <div className="flex gap-2 border-b border-white/10 pb-1 overflow-x-auto">
                {(['overview', 'debts', 'expenses', 'budget', 'income'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`
                            px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                            ${activeTab === tab
                                ? 'border-indigo-500 text-indigo-400'
                                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }
                        `}
                    >
                        {tab === 'overview' && 'Resumen'}
                        {tab === 'debts' && 'Deudas & Tarjetas'}
                        {tab === 'expenses' && 'Gastos Fijos'}
                        {tab === 'budget' && 'Presupuesto'}
                        {tab === 'income' && 'Ingresos'}
                    </button>
                ))}
            </div>

            {/* Main Content */}
            <div className="min-h-[400px]">
                {activeTab === 'overview' && (
                    <OverviewTab
                        kpis={pf.kpis}
                        upcomingMaturities={[]} // TODO
                        referenceDate={currentDate}
                    />
                )}

                {activeTab === 'debts' && (
                    <div className="space-y-8">
                        {/* Credit Cards Section */}
                        <CreditCardsSection
                            cardData={pf.cardStatementData}
                            onManageCards={() => setIsCardManageOpen(true)}
                            onAddConsumption={(cardId) => {
                                const card = pf.creditCards.find(c => c.id === cardId)
                                if (card) setConsumptionCard(card)
                            }}
                            onImportStatement={(cardId) => {
                                const card = pf.creditCards.find(c => c.id === cardId)
                                if (card) setImportCard(card)
                            }}
                            onDeleteConsumption={async (consumptionId) => {
                                await pf.deleteConsumption(consumptionId)
                                pf.refreshAll()
                                toast({ title: 'Consumo eliminado', variant: 'success' })
                            }}
                            onEditConsumption={(consumption, card) => {
                                setEditingConsumption(consumption)
                                setEditingCard(card)
                            }}
                            onMarkUnpaid={(cardId) => pf.markStatementUnpaid(cardId)}
                            onRegisterPayment={(data) => {
                                if (data.dueTotal <= 0) return
                                setExecutionTarget({ kind: 'card_statement', data })
                            }}
                        />

                        {/* Traditional Debts */}
                        <DebtsTab
                            debts={pf.debts}
                            yearMonth={pf.yearMonth}
                            onEdit={(d) => openEditModal(d as any, 'debt')}
                            onDelete={(id) => handleDelete(id, 'debt')}
                        />
                    </div>
                )}

                {activeTab === 'expenses' && (
                    <FixedExpensesTab
                        expenses={pf.fixedExpenses}
                        yearMonth={pf.yearMonth}
                        viewMode={viewMode}
                        onEdit={(e) => openEditModal(e as any, 'expense')}
                        onDelete={(id) => handleDelete(id, 'expense')}
                        onExecute={(expense) => setExecutionTarget({ kind: 'expense', expense })}
                    />
                )}

                {activeTab === 'income' && (
                    <IncomeTab
                        incomes={viewMode === 'actual' ? pf.allIncomes : pf.incomes}
                        yearMonth={pf.yearMonth}
                        viewMode={viewMode}
                        onEdit={(i) => openEditModal(i as any, 'income')}
                        onDelete={(id) => handleDelete(id, 'income')}
                        onExecute={(income) => setExecutionTarget({ kind: 'income', income })}
                    />
                )}

                {activeTab === 'budget' && (
                    <BudgetTab
                        items={pf.budgets as any}
                        onAdd={() => openNewModal('budget')}
                        onEdit={(b) => openEditModal(b as any, 'budget')}
                        onDelete={(id) => handleDelete(id, 'budget')}
                    />
                )}
            </div>

            {/* Modals */}
            <FinancesModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                type={editType}
                editItem={editItem}
                onSave={handleSave}
                preselectedType={preselectedType}
            />

            <FinanceExecutionModal
                open={!!executionTarget && !!executionDefaults}
                title={executionDefaults?.title || ''}
                subtitle={executionDefaults?.subtitle}
                defaultAmount={executionDefaults?.amount || 0}
                defaultDateISO={executionDefaults?.dateISO || getTodayISO()}
                defaultAccountId={executionDefaults?.accountId}
                onClose={() => setExecutionTarget(null)}
                onConfirm={handleExecutionConfirm}
            />

            <CardManageModal
                open={isCardManageOpen}
                onClose={() => setIsCardManageOpen(false)}
                cards={pf.creditCards}
                onCreateCard={async (c) => { await pf.createCard(c) }}
                onUpdateCard={pf.updateCard}
                onDeleteCard={pf.deleteCard}
            />

            <CardConsumptionModal
                open={!!consumptionModalCard}
                onClose={() => {
                    setConsumptionCard(null)
                    setEditingConsumption(null)
                    setEditingCard(null)
                }}
                card={consumptionModalCard}
                onSave={async (input) => {
                    await pf.createConsumption(input, consumptionModalCard!)
                    pf.refreshAll()
                }}
                onUpdate={async (id, updates) => {
                    if (!editingCard) return
                    await pf.updateConsumption(id, updates, editingCard)
                    pf.refreshAll()
                    toast({ title: 'Consumo actualizado', variant: 'success' })
                }}
                mode={editingConsumption ? 'edit' : 'create'}
                initialConsumption={editingConsumption}
            />

            <ImportStatementModal
                open={!!importCard}
                card={importCard}
                existingConsumptions={importConsumptions}
                onClose={() => setImportCard(null)}
                onImport={async (transactions, card) => {
                    for (const input of transactions) {
                        await pf.createConsumption(input, card)
                    }
                    pf.refreshAll()
                }}
            />
        </div>
    )
}
