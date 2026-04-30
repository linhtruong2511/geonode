---
name: django-view-standard
description: standard patterns for django class-based views in mvt applications. use when creating, reviewing, refactoring, or standardizing django views, especially crud flows, authentication, permissions, parent-child object handling, queryset scoping, and template naming conventions.
---

# Django Class-Based View Standards

You are an expert in Django development, specializing in building clean, maintainable, and secure Class-Based Views (CBVs).

## Core Principles

- **Security First**: Always use `LoginRequiredMixin` for views requiring authentication.
- **Convention over Configuration**: Follow the `<app_name>/<action>.html` template naming convention.
- **Dry (Don't Repeat Yourself)**: Use `generic` views and mixins to minimize boilerplate.
- **Explicit Context**: Provide clear `context_object_name` for List and Detail views.
- **Lazy Redirection**: Use `reverse_lazy` for URL resolving in class attributes.

## View Structure Patterns

### 1. List View (Index)
Standard for listing objects with pagination.
```python
class ModelNameIndex(LoginRequiredMixin, generic.ListView):
    model = ModelName
    template_name = 'app_name/index.html'
    context_object_name = "objects"
    paginate_by = 10
```

### 2. Create View (Add)
Standard for creating new records.
```python
class ModelNameAdd(LoginRequiredMixin, generic.CreateView):
    model = ModelName
    template_name = 'app_name/add.html'
    form_class = ModelNameForm
    success_url = reverse_lazy('app_name:index')
```

### 3. Update View
Standard for editing existing records.
```python
class ModelNameUpdate(LoginRequiredMixin, generic.UpdateView):
    model = ModelName
    form_class = ModelNameForm
    template_name = 'app_name/update.html'
    # success_url is handled by model.get_absolute_url() or defined here
```

### 4. Detail View with Related Data
Standard for showing record details and its related child objects.
```python
class ModelNameDetail(LoginRequiredMixin, generic.DetailView):
    model = ModelName
    template_name = 'app_name/detail.html'
    context_object_name = 'object'
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Adding related child objects to context
        context['related_items'] = RelatedModel.objects.filter(parent=self.object)
        return context
```

### 5. Child Object Creation (Scoped)
Standard for creating a child object linked to a parent via URL parameter.
```python
class ChildModelAdd(LoginRequiredMixin, generic.CreateView):
    model = ChildModel
    form_class = ChildModelForm
    template_name = 'child_app/add.html'

    def dispatch(self, request, *args, **kwargs):
        self.parent = get_object_or_404(ParentModel, pk=self.kwargs['parent_id'])
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        form.instance.parent = self.parent
        return super().form_valid(form)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['parent_id'] = self.kwargs['parent_id']
        return context
    
    def get_success_url(self):
        # Redirect back to parent detail view
        return reverse_lazy('app_name:detail', kwargs={'pk': self.object.parent.id})
```

## Template Naming Conventions
- List: `app_name/index.html`
- Create: `app_name/add.html`
- Update: `app_name/update.html`
- Detail: `app_name/detail.html`
- Delete: `app_name/delete.html`

## Best Practices
- Keep business logic in `models.py` or services, not in views.
- Use `get_queryset()` to filter data based on user or status.
- Use `get_success_url()` when the redirect target depends on the saved object.
- Always include `{% csrf_token %}` in forms.
