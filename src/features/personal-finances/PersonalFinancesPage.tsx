// =============================================================================
// PERSONAL FINANCES PAGE — Main Page Component
// =============================================================================

import { useState } from 'react'
import { Plus, Wallet, TrendingDown, ShoppingBag } from 'lucide-react'
import { usePersonalFinancesV3 } from './hooks/usePersonalFinancesV3' // V3 Hook
import { formatARS } from './models/calculations' // Keep for formatting helper
import {
    KPICard,
    CoverageRatioCard,
    MonthPicker,
    OverviewTab,
    DebtsTab,
    FixedExpensesTab,
    IncomeTab,
    BudgetTab,
    FinancesModal,
    CreditCardsSection,
    CardManageModal,
    CardConsumptionModal,
} from './components'
import type { PFDebt, FixedExpense, Income, BudgetCategory, NewItemType } from './models/types'
import type { PFCreditCard } from '@/db/schema' // V3 types

type TabType = 'overview' | 'debts' | 'expenses' | 'income' | 'budget'
type ModalType = 'debt' | 'expense' | 'income' | 'budget' | 'expense-normal'

export function PersonalFinancesPage() {
    // V3 Hook
    const pf = usePersonalFinancesV3()

    // UI State
    const [activeTab, setActiveTab] = useState<TabType>('overview')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [preselectedType, setPreselectedType] = useState<NewItemType | undefined>(undefined)
    const [editItem, setEditItem] = useState<PFDebt | FixedExpense | Income | BudgetCategory | null>(null)
    const [editType, setEditType] = useState<ModalType | undefined>(undefined)

    // Credit Card Modals
    const [isCardManageOpen, setIsCardManageOpen] = useState(false)
    const [consumptionCard, setConsumptionCard] = useState<PFCreditCard | null>(null)

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

    const handleMarkPaid = async (id: string, type: 'debt' | 'expense' | 'card') => {
        if (type === 'debt') {
            const debt = pf.debts.find((d) => d.id === id)
            if (debt) {
                await pf.registerPrepayment(id, debt.monthlyValue, 'reduce_amount') // Default behavior
            }
        } else if (type === 'expense') {
            await pf.updateFixedExpense(id, { status: 'paid' })
        }
    }

    const handleMarkReceived = async (id: string) => {
        await pf.updateIncome(id, { status: 'received' })
    }

    // Helper to convert string YYYY-MM to Date object
    const currentDate = new Date(pf.yearMonth + '-02T12:00:00')

    // Calculated fields based on V3 totals
    // Coverage Ratio
    const coverageRatio = pf.totals.totalIncome > 0
        ? (pf.totals.commitments / pf.totals.totalIncome) * 100
        : 0

    // V2 Snapshot shape helper
    const snapshotV2 = {
        monthKey: pf.yearMonth,
        totalDebts: pf.totals.totalDebts,
        totalCards: pf.totals.totalCards,
        totalFixed: pf.totals.totalFixed, // mapped from totalFixed
        totalBudgeted: pf.totals.totalBudgeted,
        totalIncome: pf.totals.totalIncome,
        available: pf.totals.available, // mapped from available
        commitments: pf.totals.commitments, // mapped from commitments
        coverageRatio: coverageRatio, // mapped from calculated ratio
    }

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Ingresos Totales"
                    value={formatARS(pf.totals.totalIncome)}
                    icon={Wallet}
                    type="success"
                />
                <KPICard
                    title="Liquidez Disponible"
                    value={formatARS(pf.totals.available)}
                    icon={ShoppingBag}
                    type={pf.totals.available >= 0 ? 'primary' : 'danger'}
                />
                <KPICard
                    title="Total Tarjetas"
                    value={formatARS(pf.totals.totalCards)}
                    icon={TrendingDown}
                    type="neutral"
                />
                <CoverageRatioCard
                    ratio={coverageRatio}
                />
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
                        totals={snapshotV2}
                        upcomingMaturities={[]} // TODO
                        referenceDate={currentDate}
                        onMarkPaid={handleMarkPaid}
                    />
                )}

                {activeTab === 'debts' && (
                    <div className="space-y-8">
                        {/* Credit Cards Section */}
                        <CreditCardsSection
                            cards={pf.creditCards}
                            consumptionsByCard={pf.consumptionsByCard}
                            yearMonth={pf.yearMonth}
                            onManageCards={() => setIsCardManageOpen(true)}
                            onAddConsumption={(cardId) => {
                                const card = pf.creditCards.find(c => c.id === cardId)
                                if (card) setConsumptionCard(card)
                            }}
                            onViewAllConsumptions={(cardId) => {
                                // TODO: Navigate to full detail or open modal
                                console.log('View all', cardId)
                            }}
                        />

                        {/* Traditional Debts */}
                        <DebtsTab
                            debts={pf.debts}
                            onEdit={(d) => openEditModal(d as any, 'debt')}
                            onDelete={(id) => handleDelete(id, 'debt')}
                        />
                    </div>
                )}

                {activeTab === 'expenses' && (
                    <FixedExpensesTab
                        expenses={pf.fixedExpenses as any}
                        onEdit={(e) => openEditModal(e as any, 'expense')}
                        onDelete={(id) => handleDelete(id, 'expense')}
                        onMarkPaid={(id) => handleMarkPaid(id, 'expense')}
                    />
                )}

                {activeTab === 'income' && (
                    <IncomeTab
                        incomes={pf.incomes as any}
                        onEdit={(i) => openEditModal(i as any, 'income')}
                        onDelete={(id) => handleDelete(id, 'income')}
                        onMarkReceived={handleMarkReceived}
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

            <CardManageModal
                open={isCardManageOpen}
                onClose={() => setIsCardManageOpen(false)}
                cards={pf.creditCards}
                onCreateCard={async (c) => { await pf.createCard(c) }}
                onUpdateCard={pf.updateCard}
                onDeleteCard={pf.deleteCard}
            />

            <CardConsumptionModal
                open={!!consumptionCard}
                onClose={() => setConsumptionCard(null)}
                card={consumptionCard}
                onSave={async (input) => {
                    await pf.createConsumption(input, consumptionCard!)
                    pf.refreshAll()
                }}
            />
        </div>
    )
}
