// =============================================================================
// PERSONAL FINANCES PAGE — Main Page Component
// =============================================================================

import { useMemo, useState } from 'react'
import { Plus, Wallet, TrendingDown, ShoppingBag, CreditCard } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import type { PFCardConsumption, PFFixedExpense, PFIncome } from '@/db/schema'
import { usePersonalFinancesV3 } from './hooks/usePersonalFinancesV3' // V3 Hook
import type { CardStatementData } from './hooks/usePersonalFinancesV3'
import { formatARS, formatUSD } from './models/calculations'
import { useFxRates } from '@/hooks/use-fx-rates'
import { getTodayISO } from './utils/dateHelpers'
import {
    getFixedExpenseScheduledDate,
    getIncomeScheduledDate,
} from './models/financeHelpers'
import {
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
    // FX Rates
    const { data: fxRates } = useFxRates()
    const mepSell = fxRates?.mep.sell ?? null

    // V3 Hook
    const pf = usePersonalFinancesV3(mepSell)

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

    if (pf.loading) {
        return <div className="p-8 text-center text-slate-500 animate-pulse">Cargando Finanzas...</div>
    }

    return (
        <div className="space-y-8">
            {/* Premium Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="font-display text-3xl font-bold text-white mb-1">Finanzas Personales</h1>
                    <p className="text-slate-400 text-sm">Controlá tus ingresos, gastos y tarjetas en un solo lugar.</p>
                </div>

                {/* Month Navigator */}
                <div className="flex items-center gap-3">
                    <MonthPicker
                        currentDate={currentDate}
                        onPrevious={pf.goToPrevMonth}
                        onNext={pf.goToNextMonth}
                    />
                    <button
                        onClick={() => openNewModal()}
                        className="hidden md:flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition shadow-glow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Nuevo</span>
                    </button>
                </div>
            </div>

            {/* Mode Switch: Plan vs Real */}
            <div className="flex flex-col items-center">
                <div className="relative bg-slate-900 p-1 rounded-xl border border-white/10 inline-flex w-full md:w-auto">
                    <div
                        className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg shadow-glow-sm transition-all duration-300 ease-out ${viewMode === 'plan' ? 'left-1 bg-indigo-500' : 'left-[calc(50%+2px)] bg-emerald-500'
                            }`}
                    />
                    <button
                        onClick={() => setViewMode('plan')}
                        className={`relative z-10 w-full md:w-48 py-2.5 text-sm font-medium rounded-lg transition-colors text-center ${viewMode === 'plan' ? 'text-white' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        Plan (Estimado)
                    </button>
                    <button
                        onClick={() => setViewMode('actual')}
                        className={`relative z-10 w-full md:w-48 py-2.5 text-sm font-medium rounded-lg transition-colors text-center ${viewMode === 'actual' ? 'text-white' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        Efectivo (Real)
                    </button>
                </div>
                <p className="mt-3 text-xs text-slate-500 font-mono text-center max-w-md">
                    {viewMode === 'plan'
                        ? 'Modo Plan: Proyecciones teóricas. No afecta saldos de cuentas.'
                        : 'Modo Efectivo: Refleja lo que ya impactó en tus cuentas.'
                    }
                </p>
            </div>

            {/* KPIs Grid (4 cards) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* KPI 1: Ingresos */}
                <div className="glass-panel p-5 rounded-xl relative overflow-hidden group">
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition">
                        <Wallet className="w-12 h-12 text-emerald-500" />
                    </div>
                    <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">Ingresos</p>
                    <div className="flex flex-col items-start h-12 justify-center">
                        <h3 className={`font-mono text-2xl transition-all ${viewMode === 'plan' ? 'text-white font-bold' : 'text-slate-500 text-sm'}`}>
                            {formatARS(pf.kpis.incomesEstimated)}
                        </h3>
                        <h3 className={`font-mono text-2xl text-emerald-400 transition-all ${viewMode === 'actual' ? 'font-bold' : 'text-sm opacity-60'}`}>
                            {formatARS(pf.kpis.incomesCollected)}
                        </h3>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500 border-t border-white/5 pt-2 w-full">
                        <span>Total estimado del mes.</span>
                    </div>
                </div>

                {/* KPI 2: Gastos */}
                <div className="glass-panel p-5 rounded-xl relative overflow-hidden group">
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition">
                        <TrendingDown className="w-12 h-12 text-rose-500" />
                    </div>
                    <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">Gastos</p>
                    <div className="flex flex-col items-start h-12 justify-center">
                        <h3 className={`font-mono text-2xl transition-all ${viewMode === 'plan' ? 'text-white font-bold' : 'text-slate-500 text-sm'}`}>
                            {formatARS(pf.kpis.totalExpensesPlan)}
                        </h3>
                        <h3 className={`font-mono text-2xl text-white transition-all ${viewMode === 'actual' ? 'font-bold' : 'text-sm opacity-60'}`}>
                            {formatARS(pf.kpis.totalExpensesReal)}
                        </h3>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500 border-t border-white/5 pt-2 w-full">
                        <span>Fijos + variables (presupuesto).</span>
                    </div>
                </div>

                {/* KPI 3: Tarjetas & Deudas */}
                <div className="glass-panel p-5 rounded-xl relative overflow-hidden group">
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition">
                        <CreditCard className="w-12 h-12 text-sky-500" />
                    </div>
                    <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">Tarjetas & Deudas</p>
                    <div className="flex flex-col items-start justify-center">
                        <h3 className="font-mono text-2xl font-bold text-white">
                            {formatARS(pf.kpis.cardsAccrued + pf.kpis.debtInstallmentsThisMonth)}
                        </h3>
                    </div>
                    <div className="mt-2 flex flex-col gap-1 text-[10px] text-slate-400 border-t border-white/5 pt-2 w-full">
                        <div className="flex flex-wrap items-center gap-x-2">
                            <span>Tarjetas: <span className="text-white font-mono">{formatARS(pf.kpis.cardsAccruedArs)}</span></span>
                            {pf.kpis.cardsAccruedUsd > 0 && (
                                <span className="flex items-center gap-1">
                                    <span>+</span>
                                    <span className="text-emerald-400 font-mono">{formatUSD(pf.kpis.cardsAccruedUsd)}</span>
                                    <span className="text-slate-500">
                                        (≈ {mepSell ? formatARS(pf.kpis.cardsAccruedUsd * mepSell) : '—'} @ MEP venta {mepSell ? formatARS(mepSell) : '—'})
                                    </span>
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <span>Deudas: <span className="text-white font-mono">{formatARS(pf.kpis.debtInstallmentsThisMonth)}</span></span>
                        </div>
                    </div>
                </div>

                {/* KPI 4: Capacidad Ahorro */}
                <div className="glass-panel p-5 rounded-xl relative overflow-hidden group border-t-2 border-t-indigo-500">
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition">
                        <ShoppingBag className="w-12 h-12 text-indigo-500" />
                    </div>
                    <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">Capacidad Ahorro</p>
                    <div className="flex flex-col items-start h-12 justify-center">
                        <h3 className={`font-mono text-2xl transition-all ${viewMode === 'plan' ? 'text-indigo-400 font-bold' : 'text-slate-500 text-sm'}`}>
                            {formatARS(pf.kpis.savingsEstimated)}
                        </h3>
                        <h3 className={`font-mono text-2xl text-indigo-400 transition-all ${viewMode === 'actual' ? 'font-bold' : 'text-sm opacity-60'}`}>
                            {formatARS(pf.kpis.savingsActual)}
                        </h3>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500 border-t border-white/5 pt-2 w-full">
                        <span>Lo que te queda libre (Plan/Real).</span>
                    </div>
                </div>
            </div>

            {/* Content Tabs - Lateral Layout */}
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Tab Navigation - Sidebar (collapses on debts tab) */}
                <nav className={`flex-shrink-0 transition-all duration-300 ease-out ${activeTab === 'debts' ? 'lg:w-16' : 'lg:w-64'
                    }`}>
                    <div className={`flex lg:flex-col overflow-x-auto lg:overflow-visible gap-2 pb-2 lg:pb-0 lg:sticky lg:top-24 ${activeTab === 'debts' ? 'lg:items-center' : ''
                        }`}>
                        {([
                            { id: 'overview', label: 'Resumen', icon: 'pie-chart' },
                            { id: 'income', label: 'Ingresos', icon: 'arrow-down-circle' },
                            { id: 'expenses', label: 'Gastos Fijos', icon: 'arrow-up-circle' },
                            { id: 'debts', label: 'Deudas & Tarjetas', icon: 'credit-card' },
                            { id: 'budget', label: 'Presupuesto', icon: 'calculator' },
                        ] as const).map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                title={activeTab === 'debts' ? tab.label : undefined}
                                className={`
                                    flex items-center gap-3 rounded-lg text-sm font-medium transition-all text-left
                                    ${activeTab === 'debts' ? 'lg:w-10 lg:h-10 lg:justify-center lg:p-0 px-4 py-3 w-full' : 'px-4 py-3 w-full'}
                                    ${activeTab === tab.id
                                        ? 'bg-white/10 text-white'
                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                    }
                                `}
                            >
                                {tab.id === 'overview' && <Wallet className="w-4 h-4 flex-shrink-0" />}
                                {tab.id === 'income' && <Wallet className="w-4 h-4 flex-shrink-0" />}
                                {tab.id === 'expenses' && <TrendingDown className="w-4 h-4 flex-shrink-0" />}
                                {tab.id === 'debts' && <CreditCard className="w-4 h-4 flex-shrink-0" />}
                                {tab.id === 'budget' && <ShoppingBag className="w-4 h-4 flex-shrink-0" />}
                                <span className={`transition-all duration-300 ${activeTab === 'debts' ? 'lg:hidden' : ''}`}>
                                    {tab.label}
                                </span>
                            </button>
                        ))}
                    </div>
                </nav>

                {/* Tab Panels Container */}
                <div className="flex-1 min-h-[400px]">
                    {activeTab === 'overview' && (
                        <OverviewTab
                            kpis={pf.kpis}
                            cardStatementData={pf.cardStatementData}
                            onGoToDebts={() => setActiveTab('debts')}
                            referenceDate={currentDate}
                            mepSell={mepSell}
                        />
                    )}

                    {activeTab === 'debts' && (
                        <div className="space-y-8">
                            {/* Credit Cards Section - UNCHANGED per requirements */}
                            <CreditCardsSection
                                cardData={pf.cardStatementData}
                                mepSell={mepSell}
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

                            {/* Traditional Debts - UNCHANGED per requirements */}
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
            </div>

            {/* Floating Action Button (Mobile) */}
            <div className="md:hidden fixed bottom-6 right-6 z-30">
                <button
                    onClick={() => openNewModal()}
                    className="w-14 h-14 bg-indigo-500 rounded-full shadow-glow flex items-center justify-center text-white"
                >
                    <Plus className="w-8 h-8" />
                </button>
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
