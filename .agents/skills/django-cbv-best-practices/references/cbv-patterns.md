# CBV Patterns

Use these patterns as defaults. Adapt model, form, and URL names to the user's project.

## 1. List view

```python
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views import generic

from .models import Project


class ProjectListView(LoginRequiredMixin, generic.ListView):
    model = Project
    template_name = "projects/index.html"
    context_object_name = "projects"
    paginate_by = 25

    def get_queryset(self):
        return (
            Project.objects.visible_to(self.request.user)
            .select_related("owner")
            .annotate_open_task_count()
            .order_by("name")
        )
```

## 2. Detail view

```python
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views import generic

from .models import Project


class ProjectDetailView(LoginRequiredMixin, generic.DetailView):
    model = Project
    template_name = "projects/detail.html"
    context_object_name = "project"

    def get_queryset(self):
        return (
            Project.objects.visible_to(self.request.user)
            .select_related("owner", "organization")
            .prefetch_related("members")
        )
```

Prefer eager loading in `get_queryset()` before adding extra database work in `get_context_data()`.

## 3. Create view

```python
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy
from django.views import generic

from .forms import ProjectForm
from .models import Project


class ProjectCreateView(LoginRequiredMixin, generic.CreateView):
    model = Project
    form_class = ProjectForm
    template_name = "projects/add.html"
    success_url = reverse_lazy("projects:index")

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["user"] = self.request.user
        return kwargs

    def form_valid(self, form):
        form.instance.owner = self.request.user
        messages.success(self.request, "Project created successfully.")
        return super().form_valid(form)
```

## 4. Update view

```python
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views import generic

from .forms import ProjectForm
from .models import Project


class ProjectUpdateView(LoginRequiredMixin, generic.UpdateView):
    model = Project
    form_class = ProjectForm
    template_name = "projects/update.html"

    def get_queryset(self):
        return Project.objects.visible_to(self.request.user)

    def form_valid(self, form):
        form.instance.updated_by = self.request.user
        return super().form_valid(form)
```

Use `get_success_url()` if the redirect depends on the saved object or current route context.

## 5. Delete view

```python
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy
from django.views import generic

from .models import Project


class ProjectDeleteView(LoginRequiredMixin, generic.DeleteView):
    model = Project
    template_name = "projects/delete.html"
    success_url = reverse_lazy("projects:index")

    def get_queryset(self):
        return Project.objects.visible_to(self.request.user)
```

For soft delete, prefer a domain method or service instead of a raw delete.

## 6. Nested child create view

```python
from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import get_object_or_404
from django.urls import reverse_lazy
from django.views import generic

from .forms import TaskForm
from .models import Project, Task


class TaskCreateView(LoginRequiredMixin, generic.CreateView):
    model = Task
    form_class = TaskForm
    template_name = "tasks/add.html"

    def dispatch(self, request, *args, **kwargs):
        self.project = get_object_or_404(
            Project.objects.visible_to(request.user),
            pk=kwargs["project_id"],
        )
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["project"] = self.project
        return context

    def form_valid(self, form):
        form.instance.project = self.project
        form.instance.created_by = self.request.user
        return super().form_valid(form)

    def get_success_url(self):
        return reverse_lazy("projects:detail", kwargs={"pk": self.project.pk})
```

## 7. Transactional state change

Use a custom `View` or `UpdateView` only when a state transition is more important than field editing.

```python
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db import transaction
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.urls import reverse_lazy
from django.views import View

from .models import Invoice


class InvoiceApproveView(LoginRequiredMixin, View):
    def post(self, request, *args, **kwargs):
        with transaction.atomic():
            invoice = get_object_or_404(
                Invoice.objects.visible_to(request.user).select_for_update(),
                pk=kwargs["pk"],
            )
            invoice.approve(approved_by=request.user)
        return HttpResponseRedirect(
            reverse_lazy("billing:detail", kwargs={"pk": invoice.pk})
        )
```

Use this pattern for approval, publish, cancel, or other domain actions that require locking and explicit business rules.
